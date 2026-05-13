import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  createAbacatePixCharge,
  checkAbacatePixStatus,
  createAbacateBilling,
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
          "Finalize sua compra do Happy 3 Em 1 com pagamento PIX seguro e instantâneo.",
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

type PixCharge = {
  id: string;
  brCode: string;
  brCodeBase64: string;
  amount: number;
  expiresAt: string | null;
};

function CheckoutPage() {
  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card">("pix");
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
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [intentError, setIntentError] = useState<string | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const [pix, setPix] = useState<PixCharge | null>(null);
  const [pixStatus, setPixStatus] = useState<"pending" | "paid" | null>(null);

  const navigate = useNavigate();
  const createCharge = useServerFn(createAbacatePixCharge);
  const checkStatus = useServerFn(checkAbacatePixStatus);
  const createBilling = useServerFn(createAbacateBilling);
  const total = PRODUCT_PRICE * quantity;

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
      .then((d: any) => {
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
    setLoadingIntent(true);
    setIntentError(null);
    try {
      const charge = await createCharge({
        data: { quantity, customer: parsed },
      });
      setPix(charge);
      setPixStatus("pending");
    } catch (err) {
      setIntentError(
        err instanceof Error ? err.message : "Erro ao iniciar pagamento",
      );
    } finally {
      setLoadingIntent(false);
    }
  };

  // Poll PIX status via AbacatePay
  useEffect(() => {
    if (!pix || pixStatus !== "pending") return;
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const res = await checkStatus({ data: { id: pix.id } });
        if (cancelled) return;
        if (res.status === "PAID") {
          setPixStatus("paid");
          navigate({ to: "/pagamento-sucesso" });
        }
      } catch {
        // silent retry
      }
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pix, pixStatus, checkStatus, navigate]);

  const handleReset = useCallback(() => {
    setPix(null);
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

        <SectionCard step={3} title="PAGAMENTO VIA PIX">
          {pix ? (
            <PixInstructions pix={pix} status={pixStatus} onReset={handleReset} />
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border-2 border-[#16a34a] bg-[#e8f5ee] p-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">📱</span>
                  <span className="font-bold text-gray-800">PIX</span>
                </div>
                <p className="mt-1 text-xs text-gray-600">
                  Aprovação imediata via QR Code
                </p>
              </div>

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

function PixInstructions({
  pix,
  status,
  onReset,
}: {
  pix: PixCharge;
  status: "pending" | "paid" | null;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!pix.expiresAt) return;
    const exp = new Date(pix.expiresAt).getTime();
    const tick = () => setRemaining(Math.max(0, exp - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [pix.expiresAt]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pix.brCode);
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

  const qrSrc = pix.brCodeBase64.startsWith("data:")
    ? pix.brCodeBase64
    : `data:image/png;base64,${pix.brCodeBase64}`;

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
        <div className="rounded-lg border-2 border-[#16a34a] bg-[#e8f5ee] p-6 text-center">
          <p className="text-4xl">✅</p>
          <p className="mt-2 text-lg font-extrabold text-[#0d8a5f]">
            Pagamento confirmado!
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col items-center gap-3 rounded-lg border border-gray-200 bg-white p-4">
            <img
              src={qrSrc}
              alt="QR Code PIX"
              className="h-56 w-56"
            />
            <p className="text-center text-xs text-gray-500">
              Aponte a câmera do seu app bancário para o QR Code acima
            </p>
            {remaining !== null && remaining > 0 && (
              <p className="text-xs font-semibold text-[#5b3a99]">
                Expira em {mmss(remaining)}
              </p>
            )}
          </div>

          <div>
            <p className="mb-1 text-xs font-bold text-gray-700">
              Ou copie o código PIX:
            </p>
            <div className="flex items-stretch gap-2">
              <input
                readOnly
                value={pix.brCode}
                className="flex-1 truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-lg bg-[#5b3a99] px-4 text-xs font-bold text-white"
              >
                {copied ? "Copiado ✓" : "Copiar"}
              </button>
            </div>
          </div>

          <div className="rounded-lg bg-[#fff7ed] px-3 py-2 text-xs text-[#9a3412]">
            ⏳ Aguardando confirmação do pagamento... Esta tela atualiza automaticamente.
          </div>
        </>
      )}
    </div>
  );
}

function Testimonials() {
  const items = [
    { img: reviewSandra, name: "Sandra M.", text: "Amei o produto, chegou rápido e bem embalado!" },
    { img: reviewHelena, name: "Helena R.", text: "Resultado incrível, já recomendei pra todas as amigas." },
    { img: reviewRicardo, name: "Ricardo P.", text: "Vale cada centavo. Comprarei novamente." },
  ];
  return (
    <section className="mb-3 rounded-xl bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-center text-sm font-bold text-gray-800">
        ⭐ O que nossos clientes dizem
      </h3>
      <div className="space-y-3">
        {items.map((it) => (
          <div key={it.name} className="flex items-start gap-3 rounded-lg border border-gray-100 p-3">
            <img src={it.img} alt={it.name} className="h-12 w-12 flex-shrink-0 rounded-full object-cover" />
            <div>
              <p className="text-sm font-bold text-gray-800">{it.name}</p>
              <p className="text-xs text-gray-600">{it.text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mt-6 text-center text-xs text-gray-500">
      <p>🔒 Pagamento processado por AbacatePay</p>
      <p className="mt-1">Em caso de dúvidas, entre em contato pelo WhatsApp.</p>
    </footer>
  );
}
