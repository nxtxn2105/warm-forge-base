import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ABACATE_API = "https://api.abacatepay.com/v1";

const customerSchema = z.object({
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
});

const inputSchema = z.object({
  quantity: z.number().int().min(1).max(10),
  customer: customerSchema,
});

const billingInputSchema = z.object({
  quantity: z.number().int().min(1).max(10),
  customer: customerSchema,
  returnUrl: z.string().url().max(500),
  completionUrl: z.string().url().max(500),
});

const UNIT_AMOUNT = 8700; // R$ 87,00 em centavos
const onlyDigits = (s: string) => s.replace(/\D/g, "");

export const createAbacatePixCharge = createServerFn({ method: "POST" })
  .inputValidator((data) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.ABACATEPAY_API_KEY;
    if (!apiKey) throw new Error("ABACATEPAY_API_KEY não configurada");

    const amount = UNIT_AMOUNT * data.quantity;

    const body = {
      amount,
      expiresIn: 60 * 60, // 1h
      description: `Happy 3 Em 1 x${data.quantity}`,
      customer: {
        name: data.customer.name,
        cellphone: data.customer.phone,
        email: data.customer.email,
        taxId: onlyDigits(data.customer.cpf),
      },
    };

    const res = await fetch(`${ABACATE_API}/pixQrCode/create`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as any;
    if (!res.ok || json?.error) {
      console.error("AbacatePay create error:", json);
      throw new Error(
        json?.error?.message || json?.message || "Falha ao gerar PIX",
      );
    }

    const d = json.data ?? json;
    return {
      id: d.id as string,
      brCode: d.brCode as string,
      brCodeBase64: d.brCodeBase64 as string,
      amount: d.amount as number,
      expiresAt: d.expiresAt as string | null,
    };
  });

export const checkAbacatePixStatus = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ id: z.string().min(1).max(80) }).parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.ABACATEPAY_API_KEY;
    if (!apiKey) throw new Error("ABACATEPAY_API_KEY não configurada");

    const res = await fetch(
      `${ABACATE_API}/pixQrCode/check?id=${encodeURIComponent(data.id)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    );

    const json = (await res.json()) as any;
    if (!res.ok || json?.error) {
      console.error("AbacatePay check error:", json);
      throw new Error(json?.error?.message || "Falha ao consultar status");
    }

    const d = json.data ?? json;
    return { status: (d.status as string) ?? "PENDING" };
  });
