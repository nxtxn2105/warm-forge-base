import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { z } from "zod";
import {
  createCheckoutPaymentIntent,
  getStripePublishableKey,
} from "@/lib/payment.functions";
import reviewSandra from "@/assets/review-sandra.jpg";
import reviewHelena from "@/assets/review-helena.jpg";
import reviewRicardo from "@/assets/review-ricardo.jpg";
import productImage from "@/assets/happy-product.png";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Happy 3 Em 1 — Checkout seguro" },
      {
        name: "description",
        content:
          "Finalize sua compra do Happy 3 Em 1 com pagamento seguro via PIX ou cartão de crédito.",
      },
    ],
  }),
  component: CheckoutPage,
});

const PRODUCT_PRICE = 8700;
const PRODUCT_NAME = "Happy 3 Em 1";

const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const onlyDigits = (s: string) => s.replace(/\D/g, "");

const customerSchema = z.object({
  name: z.string().trim().min(3, "Informe seu nome completo").max(120),
  email: z.string().trim().email("E-mail inválido").max(255),
  phone: z.string().trim().min(10, "Telefone inválido").max(20),
  cpf: z.string().trim().min(11, "CPF inválido").max(14),
  cep: z.string().trim().min(8, "CEP inválido").max(10),
  rua: z.string().trim().min(1, "Informe a rua").max(200),
  numero: z.string().trim().min(1, "Informe o número").max(20),
  complemento: z.string().trim().max(100).optional().default(""),
  bairro: z.string().trim().min(1, "Informe o bairro").max(120),
  cidade: z.string().trim().min(1, "Informe a cidade").max(120),
  uf: z.string().trim().length(2, "UF inválida"),
});

type CustomerData = z.infer<typeof customerSchema>;

function CheckoutPage() {
  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card">("pix");
  const [stripePromise, setStripePromise] =
    useState<Promise<StripeJs | null> | null>(null);
  const [stripeKeyError, setStripeKeyError] = useState<string | null>(null);
  const [customer, setCustomer] = useState<CustomerData>({
    name: "",
    email: "",
    phone: "",
    cpf: "",
    cep: "",
    rua: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof CustomerData, string>>>({});
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [intentError, setIntentError] = useState<string | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const [pixData, setPixData] = useState<{
    imageUrl: string;
    code: string;
    expiresAt: number | null;
  } | null>(null);
  const [pixStatus, setPixStatus] = useState<"pending" | "paid" | null>(null);
  const [cardStatus, setCardStatus] = useState<
    { kind: "success" } | { kind: "error"; message: string } | null
  >(null);

  const navigate = useNavigate();
  const createIntent = useServerFn(createCheckoutPaymentIntent);
  const fetchPublishableKey = useServerFn(getStripePublishableKey);
  const total = PRODUCT_PRICE * quantity;

  const ensureStripe = useCallback(() => {
    if (stripePromise) return stripePromise;
    const p = fetchPublishableKey()
      .then((res) => loadStripe(res.publishableKey))
      .catch((err) => {
        setStripeKeyError(
          err instanceof Error ? err.message : "Falha ao carregar Stripe",
        );
        return null;
      });
    setStripePromise(p);
    return p;
  }, [stripePromise, fetchPublishableKey]);

  // Preload Stripe when user selects card payment
  useEffect(() => {
    if (paymentMethod === "card") ensureStripe();
  }, [paymentMethod, ensureStripe]);

  const updateCustomer = (key: keyof CustomerData, value: string) => {
    setCustomer((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  // ViaCEP lookup
  useEffect(() => {
    const digits = onlyDigits(customer.cep);
    if (digits.length !== 8) return;
    let cancelled = false;
    setCepLoading(true);
    setCepError(null);
    fetch(`https://viacep.com.br/ws/${digits}/json/`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.erro) {
          setCepError("CEP não encontrado");
          return;
        }
        setCustomer((prev) => ({
          ...prev,
          rua: d.logradouro || prev.rua,
          bairro: d.bairro || prev.bairro,
          cidade: d.localidade || prev.cidade,
          uf: d.uf || prev.uf,
        }));
      })
      .catch(() => {
        if (!cancelled) setCepError("Erro ao buscar CEP");
      })
      .finally(() => {
        if (!cancelled) setCepLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customer.cep]);

  const validateCustomer = useCallback((): CustomerData | null => {
    const parsed = customerSchema.safeParse(customer);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof CustomerData, string>> = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as keyof CustomerData;
        if (!fieldErrors[k]) fieldErrors[k] = issue.message;
      }
      setErrors(fieldErrors);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return null;
    }
    return parsed.data;
  }, [customer]);

  const handleStartPayment = async () => {
    const parsed = validateCustomer();
    if (!parsed) return;
    const stripeP = ensureStripe();
    setLoadingIntent(true);
    setIntentError(null);
    try {
      const result = await createIntent({
        data: { quantity, paymentMethod, customer: parsed },
      });
      if (!result.clientSecret) throw new Error("Falha ao iniciar pagamento.");

      if (paymentMethod === "pix") {
        const stripe = await stripeP;
        if (!stripe) throw new Error("Stripe não carregado.");
        const { paymentIntent, error } = await stripe.confirmPixPayment(
          result.clientSecret,
          {
            payment_method: {
              billing_details: {
                name: parsed.name,
                email: parsed.email,
                phone: parsed.phone,
                address: {
                  country: "BR",
                  postal_code: parsed.cep,
                  line1: `${parsed.rua}, ${parsed.numero}`,
                  line2: parsed.complemento || parsed.bairro,
                  city: parsed.cidade,
                  state: parsed.uf,
                },
              },
            },
          },
        );
        if (error) throw new Error(error.message ?? "Erro ao gerar PIX.");
        const qr = (paymentIntent?.next_action as any)?.pix_display_qr_code;
        if (!qr) throw new Error("QR Code não disponível. Tente novamente.");
        setPixData({
          imageUrl: qr.image_url_png,
          code: qr.data,
          expiresAt: qr.expires_at ?? null,
        });
        setPixStatus("pending");
        setClientSecret(result.clientSecret);
      } else {
        setClientSecret(result.clientSecret);
      }
    } catch (err) {
      setIntentError(
        err instanceof Error ? err.message : "Erro ao iniciar pagamento",
      );
    } finally {
      setLoadingIntent(false);
    }
  };

  // Poll PIX payment status
  useEffect(() => {
    if (paymentMethod !== "pix" || !clientSecret || !stripePromise || pixStatus !== "pending") return;
    let cancelled = false;
    const check = async () => {
      const stripe = await stripePromise;
      if (!stripe || cancelled) return;
      const { paymentIntent } = await stripe.retrievePaymentIntent(clientSecret);
      if (cancelled) return;
      if (paymentIntent?.status === "succeeded") {
        setPixStatus("paid");
        navigate({ to: "/pagamento-sucesso" });
      }
    };
    const id = setInterval(check, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [paymentMethod, clientSecret, stripePromise, pixStatus, navigate]);

  const handleReset = useCallback(() => {
    setClientSecret(null);
    setPixData(null);
    setPixStatus(null);
    setIntentError(null);
  }, []);

  return (
    <main className="min-h-screen bg-[#f4f4f7] pb-12">
      <CountdownHeader />

      <div className="mx-auto max-w-2xl px-3 pt-4">
        <div className="mb-3 rounded-lg bg-[#e9e6f3] px-4 py-3 text-center text-sm font-semibold text-[#5b3a99]">
          📦 Embalagem 100% discreta
        </div>

        <ProductCard quantity={quantity} setQuantity={setQuantity} />

        <SectionCard step={1} title="DADOS PESSOAIS">
          <Field label="NOME COMPLETO" placeholder="Nome Completo" icon="👤"
            value={customer.name} onChange={(v) => updateCustomer("name", v)} error={errors.name} />
          <Field label="SEU E-MAIL" placeholder="E-mail" icon="✉️" type="email"
            value={customer.email} onChange={(v) => updateCustomer("email", v)} error={errors.email} />
          <Field label="CELULAR COM WHATSAPP" placeholder="Celular com WhatsApp" icon="📞" type="tel"
            value={customer.phone} onChange={(v) => updateCustomer("phone", v)} error={errors.phone} />
          <Field label="CPF" placeholder="CPF" icon="📄"
            value={customer.cpf} onChange={(v) => updateCustomer("cpf", v)} error={errors.cpf} />
        </SectionCard>

        <SectionCard step={2} title="DADOS PARA ENVIO">
          <Field label="CEP" placeholder="00000-000" icon="📍"
            value={customer.cep} onChange={(v) => updateCustomer("cep", v)} error={errors.cep} />
          {cepLoading && <p className="text-xs text-gray-500">Buscando endereço...</p>}
          {cepError && <p className="text-xs text-red-600">{cepError}</p>}
          <Field label="RUA" placeholder="Rua / Avenida" icon="🏠"
            value={customer.rua} onChange={(v) => updateCustomer("rua", v)} error={errors.rua} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="NÚMERO" placeholder="Nº" icon="#"
              value={customer.numero} onChange={(v) => updateCustomer("numero", v)} error={errors.numero} />
            <Field label="COMPLEMENTO" placeholder="Apto, bloco..." icon="✏️"
              value={customer.complemento} onChange={(v) => updateCustomer("complemento", v)} />
          </div>
          <Field label="BAIRRO" placeholder="Bairro" icon="📌"
            value={customer.bairro} onChange={(v) => updateCustomer("bairro", v)} error={errors.bairro} />
          <div className="grid grid-cols-[1fr_80px] gap-3">
            <Field label="CIDADE" placeholder="Cidade" icon="🏙️"
              value={customer.cidade} onChange={(v) => updateCustomer("cidade", v)} error={errors.cidade} />
            <Field label="UF" placeholder="UF" icon=""
              value={customer.uf} onChange={(v) => updateCustomer("uf", v.toUpperCase().slice(0, 2))} error={errors.uf} />
          </div>
        </SectionCard>

        <SectionCard step={3} title="DADOS DE PAGAMENTO">
          {cardStatus?.kind === "success" ? (
            <div className="rounded-lg border-2 border-[#16a34a] bg-[#e8f5ee] p-6 text-center">
              <p className="text-4xl">✅</p>
              <p className="mt-2 text-lg font-extrabold text-[#0d8a5f]">
                Pagamento aprovado!
              </p>
              <p className="mt-1 text-sm text-gray-600">
                Você receberá a confirmação no e-mail {customer.email}.
              </p>
              <button
                type="button"
                onClick={() => navigate({ to: "/pagamento-sucesso" })}
                className="mt-4 rounded-lg bg-[#16a34a] px-6 py-3 text-sm font-bold text-white hover:bg-[#138a3f]"
              >
                Ver detalhes do pedido
              </button>
            </div>
          ) : pixData ? (
            <PixInstructions
              pix={pixData}
              status={pixStatus}
              onReset={handleReset}
            />
          ) : (
            <div className="space-y-4">
              <PaymentMethodSelector value={paymentMethod} onChange={setPaymentMethod} />

              {cardStatus?.kind === "error" && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm">
                  <p className="font-bold text-red-700">❌ Pagamento não aprovado</p>
                  <p className="mt-1 text-red-600">{cardStatus.message}</p>
                </div>
              )}

              {paymentMethod === "card" ? (
                stripePromise ? (
                  <Elements
                    stripe={stripePromise}
                    options={{
                      mode: "payment",
                      amount: total,
                      currency: "brl",
                      paymentMethodTypes: ["card"],
                      locale: "pt-BR",
                      appearance: { theme: "stripe" },
                    }}
                  >
                    <CardPaymentForm
                      total={total}
                      customer={customer}
                      validateCustomer={validateCustomer}
                      quantity={quantity}
                      onSuccess={() => setCardStatus({ kind: "success" })}
                      onError={(message) => setCardStatus({ kind: "error", message })}
                    />
                  </Elements>
                ) : stripeKeyError ? (
                  <p className="text-sm text-red-600">{stripeKeyError}</p>
                ) : (
                  <p className="text-sm text-gray-500">Carregando formulário de cartão...</p>
                )
              ) : (
                <div className="border-t pt-4">
                  <p className="mb-3 text-base font-bold text-[#0d8a5f]">
                    Valor total: {formatBRL(total)}
                  </p>
                  {intentError && <p className="mb-3 text-sm text-red-600">{intentError}</p>}
                  <button
                    type="button"
                    onClick={handleStartPayment}
                    disabled={loadingIntent}
                    className="w-full rounded-lg bg-[#16a34a] py-4 text-lg font-extrabold uppercase tracking-wide text-white shadow-md transition hover:bg-[#138a3f] disabled:opacity-60"
                  >
                    {loadingIntent ? "Gerando QR Code..." : "Gerar QR Code PIX"}
                  </button>
                  <p className="mt-3 text-center text-xs text-gray-500">
                    🔒 Ambiente criptografado e 100% seguro.
                  </p>
                </div>
              )}
            </div>
          )}
        </SectionCard>

        <Testimonials />
        <Footer />
      </div>
    </main>
  );
}

function CountdownHeader() {
  const [seconds, setSeconds] = useState(6 * 60 + 39);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);
  const display = useMemo(() => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
  }, [seconds]);
  return (
    <header className="bg-[#5b3a99] py-4 text-white">
      <div className="mx-auto flex max-w-2xl items-center justify-center gap-4 px-4">
        <span className="font-mono text-2xl font-bold tracking-widest">{display}</span>
        <span aria-hidden>⏱️</span>
        <span className="font-semibold">Oferta termina em</span>
      </div>
    </header>
  );
}

function ProductCard({ quantity, setQuantity }: { quantity: number; setQuantity: (n: number) => void }) {
  return (
    <div className="mb-3 rounded-xl bg-white p-4 shadow-sm">
      <p className="mb-2 text-sm font-bold uppercase text-red-500">Você está adquirindo:</p>
      <div className="mb-3 rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm font-semibold text-yellow-900">
        🚚 Produto Físico — Será entregue no endereço informado
      </div>
      <div className="flex items-center gap-4">
        <img
          src={productImage}
          alt="Happy 3 Em 1"
          loading="eager"
          decoding="async"
          width={160}
          height={192}
          className="h-24 w-20 flex-shrink-0 rounded-md object-contain"
        />
        <div className="flex-1">
          <h2 className="text-lg font-bold text-gray-800">{PRODUCT_NAME}</h2>
          <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
            <span>Quantidade:</span>
            <div className="flex items-center overflow-hidden rounded-md border">
              <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))} className="px-3 py-1 text-lg hover:bg-gray-100">−</button>
              <span className="w-8 text-center">{quantity}</span>
              <button type="button" onClick={() => setQuantity(Math.min(10, quantity + 1))} className="px-3 py-1 text-lg hover:bg-gray-100">+</button>
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-gray-900">{formatBRL(PRODUCT_PRICE * quantity)}</div>
        </div>
      </div>
    </div>
  );
}

function SectionCard({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-3 rounded-xl bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#16a34a] font-bold text-white">{step}</span>
        <h3 className="rounded-full bg-[#e8f5ee] px-4 py-1 text-sm font-bold text-gray-800">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label, placeholder, icon, value, onChange, error, type = "text",
}: {
  label: string; placeholder: string; icon: string; value: string;
  onChange: (v: string) => void; error?: string; type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-bold tracking-wide text-gray-700">{label}</label>
      <div className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 ${error ? "border-red-400" : "border-gray-200"}`}>
        {icon && <span className="text-gray-400">{icon}</span>}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function PaymentMethodSelector({
  value,
  onChange,
}: {
  value: "pix" | "card";
  onChange: (v: "pix" | "card") => void;
}) {
  const opts = [
    { id: "pix" as const, icon: "📱", title: "PIX", desc: "Aprovação imediata via QR Code" },
    { id: "card" as const, icon: "💳", title: "Cartão de Crédito", desc: "Pague em até 12x" },
  ];
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold text-gray-800">Escolha a forma de pagamento</p>
      <div className="grid grid-cols-2 gap-3">
        {opts.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              className={`rounded-lg border-2 p-3 text-left transition ${
                active
                  ? "border-[#16a34a] bg-[#e8f5ee]"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">{o.icon}</span>
                <span className="font-bold text-gray-800">{o.title}</span>
              </div>
              <p className="mt-1 text-xs text-gray-600">{o.desc}</p>
            </button>
          );
        })}
      </div>
      <div className="rounded-lg bg-[#e8f5ee] px-3 py-2 text-xs text-[#0d8a5f]">
        🛡️ Pagamento processado pelo Stripe — 100% seguro
      </div>
    </div>
  );
}

function CardPaymentForm({
  total,
  customer,
  validateCustomer,
  quantity,
  onSuccess,
  onError,
}: {
  total: number;
  customer: CustomerData;
  validateCustomer: () => CustomerData | null;
  quantity: number;
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const createIntent = useServerFn(createCheckoutPaymentIntent);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setError(null);

    const parsed = validateCustomer();
    if (!parsed) {
      setError("Preencha seus dados pessoais e endereço antes de pagar.");
      return;
    }

    setSubmitting(true);
    const { error: submitErr } = await elements.submit();
    if (submitErr) {
      setError(submitErr.message ?? "Verifique os dados do cartão.");
      setSubmitting(false);
      return;
    }

    try {
      const result = await createIntent({
        data: { quantity, paymentMethod: "card", customer: parsed },
      });
      if (!result.clientSecret) throw new Error("Falha ao iniciar pagamento.");

      const { error: confirmErr, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret: result.clientSecret,
        redirect: "if_required",
        confirmParams: {
          return_url: `${window.location.origin}/pagamento-sucesso`,
          payment_method_data: {
            billing_details: {
              name: parsed.name,
              email: parsed.email,
              phone: parsed.phone,
              address: {
                country: "BR",
                postal_code: parsed.cep,
                line1: `${parsed.rua}, ${parsed.numero}`,
                line2: parsed.complemento || parsed.bairro,
                city: parsed.cidade,
                state: parsed.uf,
              },
            },
          },
        },
      });
      if (confirmErr) {
        const msg = confirmErr.message ?? "Erro ao processar pagamento.";
        setError(msg);
        onError(msg);
        setSubmitting(false);
        return;
      }
      if (paymentIntent?.status === "succeeded") {
        onSuccess();
        return;
      }
      if (paymentIntent?.status === "processing") {
        onSuccess();
        return;
      }
      setError("Pagamento não concluído. Tente novamente.");
      setSubmitting(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao processar pagamento.";
      setError(msg);
      onError(msg);
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {loadError && (
        <p className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700">
          {loadError}
        </p>
      )}
      <div className="rounded-lg border border-gray-200 p-3">
        <PaymentElement
          options={{
            layout: "tabs",
            fields: { billingDetails: "never" },
          }}
          onReady={() => setReady(true)}
          onLoadError={(e) =>
            setLoadError(e.error?.message ?? "Não foi possível carregar o formulário do cartão.")
          }
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="border-t pt-4">
        <p className="mb-3 text-base font-bold text-[#0d8a5f]">
          Valor total: {formatBRL(total)}
        </p>
        <button
          type="submit"
          disabled={!stripe || !ready || submitting}
          className="w-full rounded-lg bg-[#16a34a] py-4 text-lg font-extrabold uppercase tracking-wide text-white shadow-md transition hover:bg-[#138a3f] disabled:opacity-60"
        >
          {submitting ? "Processando..." : "Finalizar pagamento"}
        </button>
        <p className="mt-3 text-center text-xs text-gray-500">
          🔒 Ambiente criptografado e 100% seguro.
        </p>
      </div>
    </form>
  );
}
function PixInstructions({
  pix,
  status,
  onReset,
}: {
  pix: { imageUrl: string; code: string; expiresAt: number | null };
  status: "pending" | "paid" | null;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!pix.expiresAt) return;
    const tick = () =>
      setRemaining(Math.max(0, pix.expiresAt! * 1000 - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [pix.expiresAt]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pix.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const mmss = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-gray-700">📱 Pague com PIX</p>
        <button
          type="button"
          onClick={onReset}
          className="text-xs font-semibold text-[#5b3a99] underline"
        >
          ← Voltar
        </button>
      </div>

      {status === "paid" ? (
        <div className="rounded-lg bg-[#e8f5ee] p-4 text-center text-sm font-bold text-[#0d8a5f]">
          ✅ Pagamento confirmado! Redirecionando...
        </div>
      ) : (
        <>
          <div className="rounded-lg border-2 border-[#16a34a] bg-white p-4 text-center">
            <img
              src={pix.imageUrl}
              alt="QR Code para pagamento PIX"
              width={224}
              height={224}
              decoding="async"
              className="mx-auto h-56 w-56"
            />
            <p className="mt-2 text-xs text-gray-600">
              Abra o app do seu banco, escaneie o QR Code acima e confirme o pagamento.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-gray-700">
              Ou copie o código PIX:
            </label>
            <div className="flex gap-2">
              <input
                readOnly
                value={pix.code}
                className="flex-1 truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-lg bg-[#5b3a99] px-4 py-2 text-xs font-bold text-white hover:bg-[#4a2e7d]"
              >
                {copied ? "✓ Copiado" : "Copiar"}
              </button>
            </div>
          </div>

          {remaining !== null && (
            <p className="text-center text-xs text-gray-600">
              ⏱️ Expira em <span className="font-mono font-bold">{mmss(remaining)}</span>
            </p>
          )}

          <div className="flex items-center justify-center gap-2 rounded-lg bg-[#fff7e0] px-3 py-2 text-xs text-[#8a6a00]">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#e8a500]" />
            Aguardando confirmação do pagamento...
          </div>
        </>
      )}
    </div>
  );
}


function Testimonials() {
  const items = [
    { name: "Sandra R.", photo: reviewSandra, text: "Amei, veio rapidinho em uma embalagem bem discreta como prometido. Obrigado!" },
    { name: "Helena P.", photo: reviewHelena, text: "Já é a segunda vez que compro na apredilleta. Recomendo pra quem quer comprar produto de qualidade." },
    { name: "Ricardo B.", photo: reviewRicardo, text: "Minha esposa adorou, a coisa esquentou aqui em casa, recomendo." },
  ];
  return (
    <section className="mt-6 rounded-xl bg-white p-4 shadow-sm">
      <ul className="divide-y">
        {items.map((t) => (
          <li key={t.name} className="flex gap-3 py-3">
            <img
              src={t.photo}
              alt={`Foto de ${t.name}`}
              loading="lazy"
              decoding="async"
              width={48}
              height={48}
              className="h-12 w-12 flex-shrink-0 rounded-full object-cover"
            />
            <div>
              <p className="text-sm text-yellow-500">★★★★★</p>
              <p className="font-bold text-gray-800">{t.name}</p>
              <p className="text-sm text-gray-600">{t.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mt-8 text-center text-xs text-gray-500">
      <div className="mb-3 flex justify-center gap-6">
        <span>🛡️ Compra segura</span>
        <span>🔒 Dados protegidos</span>
      </div>
      <p>Happy 3 Em 1 — Todos os direitos reservados.</p>
      <p className="mt-1">© 2026 APREDILLETA COMERCIO E BEM ESTAR LTDA CNPJ: 59.134.397/0001-57</p>
    </footer>
  );
}
