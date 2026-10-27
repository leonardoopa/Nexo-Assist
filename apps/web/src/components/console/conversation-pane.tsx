"use client";

import { ArrowLeft, MessagesSquare } from "lucide-react";
import { Fragment, useEffect, useRef, type ReactNode, type RefObject } from "react";

import { Composer } from "@/components/chat/composer";
import { AnalystMessage, AssistantMessage, SystemEvent, UserMessage, type AssistantActions } from "@/components/chat/message";
import { firstName, formatUntil, initials } from "@/lib/format";
import { HANDOFF_REASON_LABEL } from "@/lib/labels";
import type { ConsoleDetail } from "@/server/console/view";

import type { ConsoleActionBody } from "./console-client";
import { groupByDay, type Tone } from "./view-model";

export interface Feedback {
  tone: "error" | "notice";
  text: string;
}

// The agent's answers are shown as the employee saw them, but nothing in them can be pressed from here.
const noop = () => {};
const READ_ONLY: AssistantActions = { busy: true, pendingDraftId: null, onSend: noop, onConfirm: noop, onCancel: noop, onEdit: noop };

const BADGE: Record<Tone, string> = {
  warning: "bg-warning-soft text-warning-text",
  info: "bg-primary-soft text-primary-text",
  neutral: "bg-desk text-ink-3",
  success: "bg-success-soft text-success-text",
  danger: "bg-danger-soft text-danger-text",
};

function StateBadge({ detail, mine }: { detail: ConsoleDetail; mine: boolean }) {
  const { conversation } = detail;
  const [text, tone]: [string, Tone] = (() => {
    switch (conversation.status) {
      case "awaiting_analyst":
        return ["Aguardando atendente", "warning"];
      case "with_analyst":
        return mine ? ["Você está atendendo", "info"] : [`Com ${conversation.assigneeName ?? "outro analista"}`, "neutral"];
      case "agent":
        return ["Agent atendendo", "neutral"];
      case "closed":
        return [conversation.closedBy === "agent" ? "Resolvida pelo agent" : "Encerrada", "success"];
    }
  })();
  return <span className={`flex-none rounded-md px-2 py-0.5 text-[12px] font-semibold ${BADGE[tone]}`}>{text}</span>;
}

const secondaryButton =
  "h-9 rounded-lg border border-ink/12 bg-paper px-3.5 text-[13.5px] font-medium shadow-[0_1px_2px_rgb(27_36_49/0.05)] hover:bg-desk disabled:opacity-55";
const primaryButton = "h-9 flex-none rounded-lg bg-cta px-4 text-[13.5px] font-semibold text-white hover:bg-cta-hover disabled:opacity-55";

function Bar({ tone, children, action }: { tone: Tone; children: ReactNode; action?: ReactNode }) {
  return (
    <div role="status" className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg px-3.5 py-2.5 text-[13px] leading-normal ${BADGE[tone]}`}>
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}

interface ConversationPaneProps {
  detail: ConsoleDetail;
  me: { email: string };
  now: Date;
  /** The action in flight, so its button can say what it is doing. */
  acting: ConsoleActionBody["type"] | null;
  feedback: Feedback | null;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  /** Tickets of the employee, shown under the header when the side panel does not fit. */
  tickets: ReactNode;
  /** The main ticket of the conversation, for the header. */
  ticketId: string | null;
  /** Resolves to whether the action went through, so a typed answer is not lost when it did not. */
  onAction: (body: ConsoleActionBody) => Promise<boolean>;
  onDismissFeedback: () => void;
  onBack: () => void;
}

/** The second column: who this is, the whole conversation with the agent's reasoning, and what the analyst can do about it. */
export function ConversationPane({ detail, me, now, acting, feedback, composerRef, tickets, ticketId, onAction, onDismissFeedback, onBack }: ConversationPaneProps) {
  const { conversation, messages } = detail;
  const { employee, handoff, status } = conversation;
  const first = firstName(employee.name);
  const busy = acting !== null;
  const mine = status === "with_analyst" && conversation.assigneeEmail === me.email;
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [conversation.id, messages.length]);

  const placeholder = mine
    ? `Responder a ${first}…`
    : status === "awaiting_analyst"
      ? "Assuma o atendimento para responder"
      : status === "closed"
        ? "A conversa foi encerrada"
        : "Só quem assumiu o atendimento pode responder";

  return (
    <>
      <header className="flex flex-none flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule bg-paper px-4 py-3 md:px-5">
        <button type="button" onClick={onBack} aria-label="Voltar para a lista" className="flex size-8 flex-none items-center justify-center rounded-lg text-ink-2 hover:bg-desk lg:hidden">
          <ArrowLeft className="size-4" aria-hidden="true" />
        </button>
        <span className="flex size-10 flex-none items-center justify-center rounded-full bg-desk text-[13px] font-bold text-ink-2 ring-1 ring-rule" aria-hidden="true">
          {initials(employee.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15.5px] font-semibold leading-tight">{employee.name}</h2>
          <p className="truncate text-[12.5px] text-ink-3">{[employee.department, ticketId].filter(Boolean).join(" · ") || employee.email}</p>
        </div>
        <StateBadge detail={detail} mine={mine} />
        {mine ? (
          <div className="flex flex-none gap-2">
            <button type="button" disabled={busy} onClick={() => void onAction({ type: "return" })} className={secondaryButton}>
              {acting === "return" ? "Devolvendo…" : "Devolver ao agent"}
            </button>
            <button type="button" disabled={busy} onClick={() => void onAction({ type: "close" })} className={secondaryButton}>
              {acting === "close" ? "Encerrando…" : "Encerrar atendimento"}
            </button>
          </div>
        ) : null}
      </header>

      <details className="flex-none border-b border-rule bg-desk xl:hidden">
        <summary className="cursor-pointer px-5 py-2.5 text-[13px] font-medium text-ink-2">Chamados de {first}</summary>
        <div className="max-h-72 overflow-y-auto">{tickets}</div>
      </details>

      <div className="min-h-0 flex-1 overflow-y-auto bg-desk px-4 py-5 md:px-6">
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5">
          {handoff ? (
            <section aria-label="Resumo da transferência" className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3">
              <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-warning-text">
                Resumo da transferência · Suporte {handoff.group} · {HANDOFF_REASON_LABEL[handoff.reason]}
              </h3>
              <p className="mt-1 text-[13.5px] leading-normal text-ink-2">{handoff.summary}</p>
            </section>
          ) : null}

          <div role="log" aria-label="Conversa" className="flex flex-col gap-5">
            {groupByDay(messages, now).map((group) => (
              <Fragment key={group.key}>
                <p className="flex items-center gap-3 text-[12px] font-medium text-ink-3">
                  <span className="h-px flex-1 bg-rule" aria-hidden="true" />
                  {group.label}
                  <span className="h-px flex-1 bg-rule" aria-hidden="true" />
                </p>
                {group.messages.map((message) => {
                  switch (message.role) {
                    case "user":
                      return <UserMessage key={message.id} message={message} />;
                    case "assistant":
                      return <AssistantMessage key={message.id} message={message} interactive={false} actions={READ_ONLY} />;
                    case "analyst":
                      return <AnalystMessage key={message.id} message={message} />;
                    case "system":
                      return <SystemEvent key={message.id} message={message} />;
                  }
                })}
              </Fragment>
            ))}
          </div>
          <div ref={endRef} />
        </div>
      </div>

      <footer className="flex-none border-t border-rule bg-desk px-4 pb-4 pt-3 md:px-6">
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-2.5">
          {feedback ? (
            <div
              role={feedback.tone === "error" ? "alert" : "status"}
              className={`flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-[13px] ${feedback.tone === "error" ? BADGE.danger : BADGE.warning}`}
            >
              <span className="min-w-0 flex-1">{feedback.text}</span>
              <button type="button" onClick={onDismissFeedback} className="flex-none opacity-70 hover:opacity-100">
                Fechar
              </button>
            </div>
          ) : null}

          {status === "awaiting_analyst" ? (
            <Bar
              tone="warning"
              action={
                <button type="button" disabled={busy} onClick={() => void onAction({ type: "assume" })} className={primaryButton}>
                  {acting === "assume" ? "Assumindo…" : "Assumir atendimento"}
                </button>
              }
            >
              {first} espera um atendente · Agent pausado{handoff?.respondBy ? ` · resposta ${formatUntil(handoff.respondBy, now)}` : ""}
            </Bar>
          ) : null}
          {status === "agent" ? <Bar tone="neutral">O agent está atendendo {first}. Você acompanha a conversa, mas não responde por ele.</Bar> : null}
          {status === "with_analyst" && !mine ? (
            <Bar tone="neutral">
              {conversation.assigneeName ?? "Outro analista"} está atendendo {first}. Só quem assumiu pode responder.
            </Bar>
          ) : null}
          {status === "closed" ? <Bar tone="neutral">Atendimento encerrado. {first} começa uma conversa nova na próxima mensagem.</Bar> : null}

          {/* Sending an answer must not take the field away: the next one is usually already on its way. */}
          <Composer disabled={!mine || (busy && acting !== "message")} placeholder={placeholder} inputRef={composerRef} onSend={(content) => onAction({ type: "message", content })} />
        </div>
      </footer>
    </>
  );
}

/** What the second column shows before a conversation is open, while it loads, or when it could not be opened. */
export function EmptyPane({ loading, problem }: { loading: boolean; problem: string | null }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-desk px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary-text">
        <MessagesSquare className="size-5" aria-hidden="true" />
      </span>
      <h2 className="font-display text-[26px] leading-tight tracking-[-0.5px]">
        {problem ? "Não deu para abrir a conversa" : loading ? "Abrindo a conversa…" : "Escolha uma conversa"}
      </h2>
      <p className="max-w-[380px] text-[14.5px] leading-relaxed text-ink-3">
        {problem ?? "As conversas que aguardam um analista aparecem primeiro na lista."}
      </p>
    </div>
  );
}
