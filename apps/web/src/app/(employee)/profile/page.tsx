import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ResetPassword } from "@/components/profile/reset-password";
import { TopBar } from "@/components/shell/top-bar";
import { daysSince, formatDaysAgo } from "@/lib/format";
import { requireSession } from "@/server/auth/dal";
import { getServiceDesk } from "@/server/servicedesk";

export const metadata: Metadata = { title: "Meu perfil" };

export default async function ProfilePage() {
  const session = await requireSession("employee");
  // The directory is the unstable legacy system: if it is down, the page still renders the rest.
  const directory = await getServiceDesk()
    .getUser(session.email)
    .catch(() => undefined);

  return (
    <>
      <TopBar section="Meu perfil" />
      <main className="flex-1 bg-desk px-5 py-8 md:px-8">
        <div className="mx-auto flex max-w-[560px] flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <h1 className="font-display text-[30px] leading-tight tracking-[-0.5px]">Meu perfil</h1>
            <p className="text-[15px] text-ink-3">Seus dados de acesso ao service desk de TI.</p>
          </div>

          <dl className="flex flex-col divide-y divide-rule rounded-2xl border border-rule bg-paper">
            <Row label="Nome">{session.name}</Row>
            <Row label="E-mail corporativo">
              <span className="flex flex-wrap items-center gap-2">
                {session.email}
                <span className="rounded-full bg-desk px-2 py-0.5 text-[11.5px] font-medium text-ink-3">
                  Gerenciado pela TI
                </span>
              </span>
            </Row>
            <Row label="Senha">
              {directory === undefined ? (
                <span className="text-[13.5px] text-warning-text">
                  Não foi possível consultar o diretório agora. Tente de novo em instantes.
                </span>
              ) : (
                <div className="flex flex-col gap-3">
                  {directory?.passwordChangedAt ? (
                    <span>Alterada {formatDaysAgo(daysSince(directory.passwordChangedAt))}</span>
                  ) : null}
                  <ResetPassword email={session.email} />
                </div>
              )}
            </Row>
          </dl>
        </div>
      </main>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 px-5 py-4 sm:flex-row sm:gap-6">
      <dt className="w-40 flex-none text-[13.5px] text-ink-3">{label}</dt>
      <dd className="min-w-0 flex-1 text-[14.5px]">{children}</dd>
    </div>
  );
}
