"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-desk px-6">
      <div className="flex max-w-md flex-col items-start gap-4 rounded-2xl border border-rule bg-paper p-8">
        <h1 className="font-display text-[28px] leading-tight tracking-[-0.4px]">Algo deu errado</h1>
        <p className="text-[15px] leading-relaxed text-ink-3">
          Não conseguimos carregar esta página. Tente de novo; se o problema continuar, ligue no ramal 4000.
        </p>
        <button
          type="button"
          onClick={reset}
          className="h-10 rounded-lg bg-cta px-4 text-[14.5px] font-semibold text-white hover:bg-cta-hover"
        >
          Tentar de novo
        </button>
      </div>
    </main>
  );
}
