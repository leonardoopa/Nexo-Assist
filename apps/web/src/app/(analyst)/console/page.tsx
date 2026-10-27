import type { Metadata } from "next";

import { requireSession } from "@/server/auth/dal";
import { getConversations } from "@/server/conversations";

export const metadata: Metadata = { title: "Conversas" };

const TABS = [
  { key: "for_you", label: "Para você" },
  { key: "agent", label: "Com o agent" },
  { key: "mine", label: "Minhas" },
] as const;

export default async function ConsolePage() {
  const session = await requireSession("analyst");
  const counts = getConversations().consoleCounts(session.email);

  return (
    <main className="flex flex-1 flex-col gap-6 bg-desk px-5 py-8 md:px-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-[30px] leading-tight tracking-[-0.5px]">Conversas</h1>
        <p className="text-[15px] text-ink-3">
          Olá, {session.name}. A lista de conversas e o atendimento chegam na parte do console do analista.
        </p>
      </div>

      <dl className="grid max-w-[560px] grid-cols-3 gap-3">
        {TABS.map((tab) => (
          <div key={tab.key} className="flex flex-col gap-1 rounded-xl border border-rule bg-paper px-4 py-3">
            <dt className="text-[12.5px] text-ink-3">{tab.label}</dt>
            <dd className="font-display text-[30px] leading-none tracking-[-0.5px]">{counts[tab.key]}</dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
