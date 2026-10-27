import type { Metadata } from "next";

import { NexoMark } from "@/components/brand/nexo-mark";
import { StatusChip, TopBar } from "@/components/shell/top-bar";
import { firstName } from "@/lib/format";
import { requireSession } from "@/server/auth/dal";
import { getConversations } from "@/server/conversations";

export const metadata: Metadata = { title: "Atendimento" };

export default async function ChatPage() {
  const session = await requireSession("employee");
  const conversations = getConversations();
  const open = conversations.findOpen(session.email);
  const used = open?.messageCount ?? 0;

  return (
    <>
      <TopBar section="Atendimento">
        <StatusChip>Assistente online</StatusChip>
      </TopBar>

      <main className="flex flex-1 flex-col bg-desk">
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <div className="flex max-w-[460px] flex-col items-center gap-4 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary-text">
              <NexoMark className="h-[18px] w-[18px]" />
            </span>
            <h1 className="font-display text-[30px] leading-tight tracking-[-0.5px]">Olá, {firstName(session.name)}.</h1>
            <p className="text-[15px] leading-relaxed text-ink-3">
              Descreva o que está acontecendo. Eu consulto seus chamados, busco na central de ajuda e chamo um analista
              quando precisar.
            </p>
            <p className="rounded-lg bg-warning-soft px-3 py-2 text-[12.5px] text-warning-text">
              A conversa com o agent chega na próxima parte do projeto.
            </p>
          </div>
        </div>

        <div className="border-t border-rule bg-paper px-5 py-4 md:px-8">
          <form className="mx-auto flex max-w-3xl flex-col gap-2">
            <div className="flex items-center gap-3">
              <input
                disabled
                aria-label="Mensagem para o Nexo"
                placeholder="Escreva para o Nexo…"
                className="h-11 min-w-0 flex-1 rounded-lg border border-ink/12 bg-desk px-3.5 text-[14.5px] placeholder:text-ink-3/70 disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                disabled
                className="h-11 rounded-lg bg-cta px-5 text-[14.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Enviar
              </button>
            </div>
            <p className="text-right text-[12px] text-ink-3">
              {used}/{conversations.messageLimit} mensagens nesta sessão
            </p>
          </form>
        </div>
      </main>
    </>
  );
}
