import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "ttclid",
  "tbclid",
  "xcod",
  "sck",
  "src",
  "cid",
];

const VSL_PLAYER_SRC =
  "https://scripts.converteai.net/a4ee768c-3678-4a50-b292-4ccee472b1e2/players/69fd39389d89e9b2b5ac3d94/v4/player.js";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Happy 3 Em 1 — Descubra o segredo do prazer" },
      {
        name: "description",
        content:
          "Assista ao vídeo e descubra como o Happy 3 Em 1 está transformando a vida íntima de milhares de casais.",
      },
    ],
    links: [
      // Pré-conexão apenas com o domínio do player real, sem baixar nada
      { rel: "preconnect", href: "https://scripts.converteai.net", crossOrigin: "" },
      { rel: "preconnect", href: "https://cdn.converteai.net", crossOrigin: "" },
      { rel: "dns-prefetch", href: "https://images.converteai.net" },
    ],
  }),
  component: VSLPage,
});

function VSLPage() {
  const search = typeof window !== "undefined" ? window.location.search : "";
  const params = new URLSearchParams(search);
  const utmSearch: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) utmSearch[key] = value;
  }
  return (
    <main className="min-h-screen bg-[#f4f4f7] pb-12">
      <header className="bg-[#5b3a99] py-4 text-center text-white">
        <h1 className="text-xl font-bold tracking-wide">HAPPY 3 EM 1</h1>
      </header>

      <div className="mx-auto max-w-2xl px-4 pt-6">
        <div className="rounded-xl bg-white p-4 shadow-sm sm:p-6">
          <h2 className="mb-3 text-center text-2xl font-extrabold leading-tight text-gray-900 sm:text-3xl">
            Descubra o segredo que está reacendendo a chama de milhares de
            casais
          </h2>
          <p className="mb-4 text-center text-sm text-gray-600 sm:text-base">
            Assista ao vídeo abaixo até o final para entender como funciona.
          </p>

          <VSLPlayer />

          <div className="mb-4 rounded-lg bg-[#e9e6f3] px-4 py-3 text-center text-sm font-semibold text-[#5b3a99]">
            📦 Embalagem 100% discreta · 🛡️ Compra 100% segura
          </div>

          <ul className="mb-6 space-y-2 text-sm text-gray-700">
            <li>✓ Resultados imediatos e duradouros</li>
            <li>✓ Fórmula natural e aprovada</li>
            <li>✓ Entrega rápida em todo o Brasil</li>
            <li>✓ Garantia de satisfação</li>
          </ul>

          <Link
            to="/checkout"
            search={utmSearch}
            className="block w-full rounded-lg bg-[#16a34a] py-4 text-center text-lg font-extrabold uppercase tracking-wide text-white shadow-md transition hover:bg-[#138a3f]"
          >
            Quero comprar agora
          </Link>
          <p className="mt-3 text-center text-xs text-gray-500">
            🔒 Pagamento criptografado e 100% seguro
          </p>
        </div>

        <footer className="mt-8 text-center text-xs text-gray-500">
          <p>Happy 3 Em 1 — Todos os direitos reservados.</p>
          <p className="mt-1">
            © 2026 APREDILLETA COMERCIO E BEM ESTAR LTDA CNPJ:
            59.134.397/0001-57
          </p>
        </footer>
      </div>
    </main>
  );
}

/**
 * Player VSL com click-to-load:
 * - SSR/initial paint: somente um placeholder leve (zero requests, sem JS de player).
 * - Aspect-ratio fixo 16:9 reserva o espaço exato → previne CLS.
 * - O script do player só é injetado APÓS o clique do usuário.
 */
function VSLPlayer() {
  const [loaded, setLoaded] = useState(false);

  const handlePlay = () => {
    if (loaded) return;
    setLoaded(true);
    // Carrega o script do player apenas no clique
    if (typeof document !== "undefined" && !document.querySelector(`script[src="${VSL_PLAYER_SRC}"]`)) {
      const s = document.createElement("script");
      s.src = VSL_PLAYER_SRC;
      s.async = true;
      document.head.appendChild(s);
    }
  };

  return (
    <div
      className="mb-4 w-full overflow-hidden rounded-lg bg-black"
      style={{ aspectRatio: "16 / 9", contain: "layout paint" }}
    >
      {loaded ? (
        <div id="vid-69fd39389d89e9b2b5ac3d94" style={{ width: "100%", height: "100%" }} />
      ) : (
        <button
          type="button"
          onClick={handlePlay}
          aria-label="Reproduzir vídeo"
          className="flex h-full w-full cursor-pointer items-center justify-center bg-gradient-to-br from-[#1a1a2e] to-[#000] text-white transition hover:opacity-90"
        >
          <span className="flex flex-col items-center">
            <span
              aria-hidden
              className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 text-3xl backdrop-blur-sm sm:h-20 sm:w-20 sm:text-4xl"
            >
              ▶
            </span>
            <span className="mt-3 text-sm font-semibold opacity-90">
              Toque para assistir
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
