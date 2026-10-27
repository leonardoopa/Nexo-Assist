import type { ReactNode } from "react";

import { daysSince, formatDateTime, formatDaysAgo, formatDraftId, formatShortDate, formatUntil } from "@/lib/format";
import { AFFECTED_LABEL, CATEGORY_LABEL, PRIORITY_LABEL, STATUS_LABEL } from "@/lib/labels";
import type { DraftPart, TicketSnapshot } from "@/server/conversations/types";
import type { Priority, TicketStatus } from "@/server/servicedesk/schemas";

const STATUS_TONE: Record<TicketStatus, string> = {
  aberto: "bg-primary-soft text-primary-text",
  em_andamento: "bg-primary-soft text-primary-text",
  aguardando_analista: "bg-warning-soft text-warning-text",
  em_atendimento: "bg-primary-soft text-primary-text",
  aprovado: "bg-success-soft text-success-text",
  resolvido: "bg-desk text-ink-3",
};

const PRIORITY_DOT: Record<Priority, string> = {
  critica: "bg-danger",
  alta: "bg-warning",
  media: "bg-primary",
  baixa: "bg-ink-3",
};

const CARD = "overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-[0_1px_2px_rgb(27_36_49/0.05)]";

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`rounded-md px-2 py-0.5 text-[12px] font-semibold ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-1.5 rounded-full ${PRIORITY_DOT[priority]}`} aria-hidden="true" />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-[12.5px] text-ink-3">{label}</dt>
      <dd className="text-[14.5px] font-medium">{children}</dd>
    </div>
  );
}

/** A ticket as shown in the conversation: what it is, where it stands, and whether it is late. */
export function TicketCard({ ticket }: { ticket: TicketSnapshot }) {
  return (
    <article className={`${CARD} max-w-[600px]`}>
      <div className="flex flex-col gap-1.5 px-[18px] pb-3.5 pt-4">
        <div className="flex items-center gap-2 text-[12.5px] text-ink-3">
          <span className="font-medium">Chamado</span>
          <span className="size-[3px] rounded-full bg-rule" aria-hidden="true" />
          <span>{ticket.id}</span>
          <span className="ml-auto">
            <StatusBadge status={ticket.status} />
          </span>
        </div>
        <h3 className="text-base font-semibold leading-tight tracking-[-0.2px]">{ticket.title}</h3>
        {ticket.description ? <p className="line-clamp-3 text-[13.5px] leading-normal text-ink-2">{ticket.description}</p> : null}
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-rule px-[18px] py-3 sm:grid-cols-4">
        <Field label="Categoria">
          {CATEGORY_LABEL[ticket.category]}
          {ticket.subcategory ? ` › ${ticket.subcategory}` : ""}
        </Field>
        <Field label="Prioridade">
          <PriorityBadge priority={ticket.priority} />
        </Field>
        <Field label="Aberto em">{formatDateTime(ticket.createdAt)}</Field>
        <Field label="Última atualização">
          {formatDaysAgo(daysSince(ticket.lastResponseAt))}
          {ticket.overdue ? <span className="text-danger-text"> · prazo vencido</span> : null}
        </Field>
      </dl>
    </article>
  );
}

/** The employee's open tickets as a list to choose from. Picking one is the same as writing its name. */
export function TicketPicker({ tickets, disabled, onPick }: { tickets: TicketSnapshot[]; disabled: boolean; onPick: (ticket: TicketSnapshot) => void }) {
  return (
    <ul className={`${CARD} flex max-w-[600px] flex-col divide-y divide-rule`}>
      {tickets.map((ticket) => (
        <li key={ticket.id}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick(ticket)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-desk disabled:cursor-default disabled:hover:bg-paper"
          >
            <span className="w-[76px] flex-none text-[12.5px] font-medium text-ink-3">{ticket.id}</span>
            <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium">{ticket.title}</span>
            <StatusBadge status={ticket.status} />
            <span className="hidden w-12 flex-none text-right text-[12.5px] text-ink-3 sm:block">{formatShortDate(ticket.createdAt)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const DRAFT_KIND: Record<DraftPart["kind"], string> = {
  ticket_create: "Novo chamado",
  ticket_update: "Atualização de chamado",
  ticket_reopen: "Reabertura de chamado",
};

function DraftState({ draft }: { draft: DraftPart }) {
  const states: Record<DraftPart["status"], { dot: string; text: string; label: string }> = {
    pending: { dot: "bg-warning", text: "text-warning-text", label: "Aguardando confirmação" },
    confirmed: { dot: "bg-success", text: "text-success-text", label: draft.ticketId ? `Confirmado · ${draft.ticketId}` : "Confirmado" },
    cancelled: { dot: "bg-ink-3", text: "text-ink-3", label: "Cancelado" },
    superseded: { dot: "bg-ink-3", text: "text-ink-3", label: "Substituído por um rascunho novo" },
  };
  const state = states[draft.status];
  return (
    <span className={`flex items-center gap-1.5 text-[12.5px] font-medium ${state.text}`}>
      <span className={`size-1.5 rounded-full ${state.dot}`} aria-hidden="true" />
      {state.label}
    </span>
  );
}

interface DraftCardProps {
  draft: DraftPart;
  /** The employee can still decide on this draft right now. */
  active: boolean;
  onConfirm: (draftId: number) => void;
  onCancel: (draftId: number) => void;
  onEdit: () => void;
}

/** Everything the agent is about to do, laid out for a last look: nothing happens until the employee confirms. */
export function DraftCard({ draft, active, onConfirm, onCancel, onEdit }: DraftCardProps) {
  const settled = draft.status !== "pending";
  return (
    <article className={`${CARD} w-full max-w-[720px] ${settled ? "opacity-80" : ""}`} aria-label={`Rascunho ${formatDraftId(draft.draftId)}`}>
      <div className="flex flex-col gap-1.5 px-[18px] pb-3.5 pt-4">
        <div className="flex items-center gap-2 pb-0.5 text-[12.5px] text-ink-3">
          <span className="font-medium">{DRAFT_KIND[draft.kind]}</span>
          <span className="size-[3px] rounded-full bg-rule" aria-hidden="true" />
          <span>Rascunho {formatDraftId(draft.draftId)}</span>
          <span className="ml-auto">
            <DraftState draft={draft} />
          </span>
        </div>
        <h3 className="text-lg font-semibold leading-tight tracking-[-0.2px]">{draft.title}</h3>
        <p className="whitespace-pre-wrap text-[13.5px] leading-normal text-ink-2">{draft.description}</p>
        {draft.similar.length > 0 ? (
          <p className="pt-1 text-[12.5px] text-warning-text">
            Parecido com {draft.similar.map((ticket) => ticket.id).join(", ")}: confira se não é o mesmo problema.
          </p>
        ) : null}
      </div>

      {draft.kind === "ticket_create" && draft.category && draft.priority && draft.affected ? (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 border-t border-rule px-[18px] py-3 sm:grid-cols-3">
          <Field label="Categoria">
            {CATEGORY_LABEL[draft.category]}
            {draft.subcategory ? ` › ${draft.subcategory}` : ""}
          </Field>
          <Field label="Prioridade">
            <PriorityBadge priority={draft.priority} />
            <span className="text-[13.5px] font-normal text-ink-3">
              {" "}
              · {draft.dueAt ? `resposta ${formatUntil(draft.dueAt)}` : `resposta em até ${draft.slaLabel ?? "o prazo da prioridade"}`}
            </span>
          </Field>
          <Field label="Afetados">{AFFECTED_LABEL[draft.affected]}</Field>
        </dl>
      ) : null}

      {draft.status === "pending" && active ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-rule bg-desk py-2 pl-2 pr-3.5">
          <button
            type="button"
            onClick={() => onConfirm(draft.draftId)}
            className="flex h-9 items-center gap-2 rounded-lg bg-cta pl-3.5 pr-2.5 text-[13.5px] font-semibold text-white hover:bg-cta-hover"
          >
            Confirmar
            <kbd className="rounded-md bg-white/15 px-[5px] py-px font-sans text-[11.5px] font-normal text-white/80">⌘↵</kbd>
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="h-9 rounded-lg border border-ink/12 bg-paper px-3.5 text-[13.5px] font-medium shadow-[0_1px_2px_rgb(27_36_49/0.05)] hover:bg-desk"
          >
            Editar
          </button>
          <button type="button" onClick={() => onCancel(draft.draftId)} className="h-9 rounded-lg px-3.5 text-[13.5px] font-medium text-ink-2 hover:bg-rule/60">
            Cancelar
          </button>
        </div>
      ) : null}
    </article>
  );
}

/** Short answers the employee can tap instead of typing. */
export function QuickReplies({ options, disabled, onPick }: { options: string[]; disabled: boolean; onPick: (text: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          onClick={() => onPick(option)}
          className="rounded-lg border border-rule bg-paper px-3 py-[7px] text-[13.5px] font-medium enabled:hover:border-primary enabled:hover:bg-primary-soft enabled:hover:text-primary-text disabled:opacity-55"
        >
          {option}
        </button>
      ))}
    </div>
  );
}
