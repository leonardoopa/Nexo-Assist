import type { ReactNode } from "react";

import { formatUntil } from "@/lib/format";
import type { ConversationView } from "@/server/chat/view";

import type { ChatError } from "./chat-reducer";

const TONES = {
  warning: "bg-warning-soft text-warning-text",
  info: "bg-primary-soft text-primary-text",
  neutral: "bg-paper text-ink-2 border border-rule",
  danger: "bg-danger-soft text-danger-text",
} as const;

function Banner({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return (
    <div role="status" className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3.5 py-2.5 text-[13px] leading-normal ${TONES[tone]}`}>
      {children}
    </div>
  );
}

const linkButton = "font-semibold underline underline-offset-2 hover:no-underline";

/** Who is handling the conversation, or why the employee cannot write to the agent any more. */
export function ConversationBanner({ conversation, atLimit, onNew }: { conversation: ConversationView | null; atLimit: boolean; onNew: () => void }) {
  if (!conversation) return null;

  if (conversation.status === "awaiting_analyst") {
    const handoff = conversation.handoff;
    return (
      <Banner tone="warning">
        <span>
          Transferida para o Suporte {handoff?.group ?? ""}.{" "}
          {handoff?.respondBy ? `Um analista responde ${formatUntil(handoff.respondBy)}.` : "Um analista responde em breve."} O agent não responde
          enquanto isso: o que você escrever vai direto para o analista.
        </span>
      </Banner>
    );
  }
  if (conversation.status === "with_analyst") {
    return <Banner tone="info">{conversation.assigneeName ?? "Um analista"} está atendendo você. O agent está pausado.</Banner>;
  }
  if (conversation.status === "closed") {
    return (
      <Banner tone="neutral">
        <span>Atendimento encerrado.</span>
        <button type="button" onClick={onNew} className={linkButton}>
          Nova conversa
        </button>
      </Banner>
    );
  }
  if (atLimit) {
    return (
      <Banner tone="neutral">
        <span>Esta sessão chegou ao limite de {conversation.messageLimit} mensagens.</span>
        <button type="button" onClick={onNew} className={linkButton}>
          Nova conversa
        </button>
      </Banner>
    );
  }
  return null;
}

export function ErrorNotice({ error, onRetry, onNew, onDismiss }: { error: ChatError; onRetry: () => void; onNew: () => void; onDismiss: () => void }) {
  return (
    <div role="alert" className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg px-3.5 py-2.5 text-[13.5px] ${TONES.danger}`}>
      <span className="min-w-0 flex-1">{error.message}</span>
      {error.retryable ? (
        <button type="button" onClick={onRetry} className={linkButton}>
          Tentar de novo
        </button>
      ) : null}
      {error.code === "limit_reached" || error.code === "conversation_closed" ? (
        <button type="button" onClick={onNew} className={linkButton}>
          Nova conversa
        </button>
      ) : null}
      <button type="button" onClick={onDismiss} className="opacity-70 hover:opacity-100">
        Fechar
      </button>
    </div>
  );
}
