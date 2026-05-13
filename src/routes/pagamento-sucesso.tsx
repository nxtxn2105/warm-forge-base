import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/pagamento-sucesso")({
  head: () => ({
    meta: [{ title: "Pagamento confirmado" }],
  }),
  component: SuccessPage,
});

function SuccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f4f7] px-4">
      <div className="max-w-md rounded-xl bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#16a34a] text-3xl text-white">
          ✓
        </div>
        <h1 className="mb-2 text-2xl font-bold text-gray-800">
          Pagamento recebido!
        </h1>
        <p className="mb-6 text-gray-600">
          Obrigado pela sua compra. Você receberá um e-mail de confirmação em
          instantes com os detalhes do pedido.
        </p>
        <Link
          to="/"
          className="inline-block rounded-lg bg-[#5b3a99] px-6 py-3 font-semibold text-white"
        >
          Voltar
        </Link>
      </div>
    </main>
  );
}
