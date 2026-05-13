import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import Stripe from "stripe";

const inputSchema = z.object({
  quantity: z.number().int().min(1).max(10),
  paymentMethod: z.enum(["pix", "card"]).default("pix"),
  customer: z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(255),
    phone: z.string().trim().min(8).max(30),
    cpf: z.string().trim().min(11).max(20),
    cep: z.string().trim().min(8).max(15),
    rua: z.string().trim().min(1).max(200),
    numero: z.string().trim().min(1).max(20),
    complemento: z.string().trim().max(100).optional().default(""),
    bairro: z.string().trim().min(1).max(120),
    cidade: z.string().trim().min(1).max(120),
    uf: z.string().trim().min(2).max(2),
  }),
});

const PRICE_ID = "price_1TW1UvAQyEZ1lFu3AxluYQyU";
const UNIT_AMOUNT = 8700; // R$ 87,00 in cents

export const getStripePublishableKey = createServerFn({ method: "GET" })
  .handler(async () => {
    const key = process.env.STRIPE_PUBLISHABLE_KEY;
    if (!key) throw new Error("STRIPE_PUBLISHABLE_KEY is not configured");
    return { publishableKey: key };
  });

export const createCheckoutPaymentIntent = createServerFn({ method: "POST" })
  .inputValidator((data) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not configured");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" as any });

    const line1 = `${data.customer.rua}, ${data.customer.numero}${data.customer.complemento ? " - " + data.customer.complemento : ""}`;

    const methodTypes = data.paymentMethod === "card" ? ["card"] : ["pix"];

    const intent = await stripe.paymentIntents.create({
      amount: UNIT_AMOUNT * data.quantity,
      currency: "brl",
      payment_method_types: methodTypes,
      receipt_email: data.customer.email,
      description: `Happy 3 Em 1 x${data.quantity}`,
      metadata: {
        price_id: PRICE_ID,
        quantity: String(data.quantity),
        customer_name: data.customer.name,
        customer_phone: data.customer.phone,
        customer_cpf: data.customer.cpf,
        customer_cep: data.customer.cep,
        customer_address: `${line1}, ${data.customer.bairro}, ${data.customer.cidade}/${data.customer.uf}`,
      },
      shipping: {
        name: data.customer.name,
        phone: data.customer.phone,
        address: {
          country: "BR",
          postal_code: data.customer.cep,
          line1,
          line2: data.customer.bairro,
          city: data.customer.cidade,
          state: data.customer.uf,
        },
      },
    });

    return {
      clientSecret: intent.client_secret,
      amount: intent.amount,
    };
  });
