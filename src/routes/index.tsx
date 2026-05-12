import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Meu Site" },
      { name: "description", content: "Base inicial do site." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-2xl text-center space-y-6">
        <span className="inline-block text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Em construção
        </span>
        <h1 className="text-5xl md:text-6xl font-semibold tracking-tight text-foreground">
          Meu Site
        </h1>
        <p className="text-lg text-muted-foreground">
          Esta é a base do site. O conteúdo será adicionado em breve conforme os arquivos forem enviados.
        </p>
      </div>
    </main>
  );
}
