import { Check, LoaderCircle, TriangleAlert } from "lucide-react";

import { formatClock } from "@/lib/format";
import type { MessageView } from "@/server/chat/view";

import { DraftCard, QuickReplies, TicketCard, TicketPicker } from "./cards";
import { DecisionDetails } from "./decision-panel";

interface StepView {
  id: string;
  label: string;
  status: "running" | "ok" | "error";
}

/** "Nexo Assist  consultou seus chamados  buscou na central de ajuda": what the agent did before answering. */
export function StatusLine({ steps }: { steps: StepView[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
      <span className="font-semibold">Nexo Assist</span>
      {steps.map((step) => (
        <span key={step.id} className={`flex items-center gap-[5px] ${step.status === "error" ? "text-warning-text" : "text-ink-3"}`}>
          {step.status === "running" ? (
            <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
          ) : step.status === "error" ? (
            <TriangleAlert className="size-3" aria-hidden="true" />
          ) : (
            <Check className="size-3" aria-hidden="true" />
          )}
          {step.label}
        </span>
      ))}
    </div>
  );
}

export function UserMessage({ message }: { message: MessageView }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[520px] whitespace-pre-wrap rounded-[12px_12px_4px_12px] bg-ink px-4 py-[11px] text-[14.5px] leading-[1.45] text-white">
        {message.content}
      </p>
    </div>
  );
}

export interface AssistantActions {
  /** A turn is running: nothing can be sent or decided now. */
  busy: boolean;
  pendingDraftId: number | null;
  onSend: (text: string) => void;
  onConfirm: (draftId: number) => void;
  onCancel: (draftId: number) => void;
  onEdit: () => void;
}

export function AssistantMessage({ message, interactive, actions }: { message: MessageView; interactive: boolean; actions: AssistantActions }) {
  const quick = message.parts.find((part) => part.type === "quick_replies");
  const steps = (message.decision?.steps ?? []).map((step) => ({ id: step.id, label: step.label, status: step.status }));

  return (
    <div className="flex flex-col items-start gap-1.5">
      <StatusLine steps={steps} />
      <div className="max-w-[600px] rounded-[4px_12px_12px_12px] border border-rule bg-paper px-4 py-3">
        <p className="whitespace-pre-wrap text-[14.5px] leading-normal">{message.content}</p>
        {quick?.type === "quick_replies" ? <QuickReplies options={quick.options} disabled={!interactive} onPick={actions.onSend} /> : null}
      </div>

      {message.parts.map((part, index) => {
        switch (part.type) {
          case "ticket_card":
            return <TicketCard key={`${part.type}-${index}`} ticket={part.ticket} />;
          case "ticket_picker":
            return (
              <TicketPicker
                key={`${part.type}-${index}`}
                tickets={part.tickets}
                disabled={!interactive}
                onPick={(ticket) => actions.onSend(`${ticket.id} · ${ticket.title}`)}
              />
            );
          case "draft":
            return (
              <DraftCard
                key={`${part.type}-${part.draftId}`}
                draft={part}
                active={!actions.busy && actions.pendingDraftId === part.draftId}
                onConfirm={actions.onConfirm}
                onCancel={actions.onCancel}
                onEdit={actions.onEdit}
              />
            );
          default:
            return null;
        }
      })}

      {message.decision ? <DecisionDetails decision={message.decision} /> : null}
    </div>
  );
}

/** A person from the service desk writing in the conversation. */
export function AnalystMessage({ message }: { message: MessageView }) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex items-center gap-2 text-[12.5px]">
        <span className="font-semibold">{message.authorName ?? "Analista"}</span>
        <span className="text-ink-3">Suporte de TI · {formatClock(message.createdAt)}</span>
      </div>
      <p className="max-w-[600px] whitespace-pre-wrap rounded-[4px_12px_12px_12px] border border-primary/30 bg-primary-soft px-4 py-3 text-[14.5px] leading-normal">
        {message.content}
      </p>
    </div>
  );
}

/** "Transferida para Suporte N2 · 10:05": the timeline of who is handling the conversation. */
export function SystemEvent({ message }: { message: MessageView }) {
  return (
    <p className="flex items-center gap-3 text-center text-[12.5px] text-ink-3">
      <span className="h-px flex-1 bg-rule" aria-hidden="true" />
      <span>
        {message.content} · {formatClock(message.createdAt)}
      </span>
      <span className="h-px flex-1 bg-rule" aria-hidden="true" />
    </p>
  );
}

/** The answer being written: the steps so far, then the text as it streams in. */
export function LiveTurn({ steps, text }: { steps: Array<StepView>; text: string }) {
  return (
    <div className="flex flex-col items-start gap-1.5" aria-live="polite">
      <StatusLine steps={steps} />
      <div className="max-w-[600px] rounded-[4px_12px_12px_12px] border border-rule bg-paper px-4 py-3">
        {text ? (
          <p className="whitespace-pre-wrap text-[14.5px] leading-normal">{text}</p>
        ) : (
          <span className="flex items-center gap-1 py-1" role="status" aria-label="Nexo está escrevendo">
            <span className="size-1.5 animate-pulse rounded-full bg-ink-3" />
            <span className="size-1.5 animate-pulse rounded-full bg-ink-3 [animation-delay:150ms]" />
            <span className="size-1.5 animate-pulse rounded-full bg-ink-3 [animation-delay:300ms]" />
          </span>
        )}
      </div>
    </div>
  );
}
