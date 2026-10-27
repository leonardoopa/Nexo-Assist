import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { NexoMark } from "@/components/brand/nexo-mark";
import { LoginForm } from "@/components/login/login-form";
import { LoginShowcase } from "@/components/login/login-showcase";
import { getSession } from "@/server/auth/dal";
import { homeFor } from "@/server/session";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(homeFor(session.role));

  return (
    <main className="flex min-h-screen bg-paper">
      <LoginShowcase />
      <section className="flex min-w-0 flex-1 flex-col justify-between gap-10 px-6 py-8 sm:px-14 sm:py-10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 lg:invisible">
            <NexoMark className="h-5 w-5 text-primary" />
            <span className="text-base font-bold tracking-[-0.2px]">Nexo Assist</span>
          </div>
          <p className="flex items-center gap-1.5 text-[13.5px]">
            <span className="text-ink-3">Problema para entrar?</span>
            <span className="font-semibold text-primary-text">Ligue no ramal 4000</span>
          </p>
        </div>

        <div className="flex justify-center">
          <LoginForm />
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3">
          <span>© 2026 Nexo · Service desk de TI</span>
          <span>Privacidade e uso de dados</span>
        </footer>
      </section>
    </main>
  );
}
