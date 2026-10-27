import type { ReactNode } from "react";

import { PriorityBadge, StatusBadge } from "@/components/chat/cards";
import { firstName, formatClock, formatShortDate } from "@/lib/format";
import { CATEGORY_LABEL } from "@/lib/labels";
import type { ConsoleTickets } from "@/server/console/view";

import { RELATION_LABEL, type TicketRow, type TicketsOverview } from "./view-model";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col">
      <h3 className="px-4 pb-1.5 pt-4 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">{title}</h3>
      <ul className="border-y border-rule bg-paper">{children}</ul>
    </section>
  );
}

function Row({ row }: { row: TicketRow }) {
  const { ticket } = row;
  const open = ticket ? ticket.status !== "resolvido" : false;
  return (
    <li className="flex flex-col gap-1 border-b border-rule px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-2 text-[12.5px]">
        <span className="font-medium text-ink-3">{row.id}</span>
        {ticket ? (
          <span className="ml-auto">
            <StatusBadge status={ticket.status} />
          </span>
        ) : null}
      </div>
      {ticket ? (
        <>
          <p className="text-[13.5px] font-semibold leading-snug">{ticket.title}</p>
          <p className="text-[12.5px] text-ink-3">
            {CATEGORY_LABEL[ticket.category]} · <PriorityBadge priority={ticket.priority} />
            {open && ticket.overdue ? <span className="text-danger-text"> · prazo vencido</span> : null}
          </p>
          {ticket.status === "em_atendimento" && ticket.assignee ? (
            <p className="text-[12.5px] text-ink-2">Assumido por {ticket.assignee}</p>
          ) : open && ticket.assignee ? (
            <p className="text-[12.5px] text-ink-2">Com {ticket.assignee}</p>
          ) : null}
          {!open && ticket.resolvedAt ? <p className="text-[12.5px] text-ink-3">Resolvido em {formatShortDate(ticket.resolvedAt)}</p> : null}
        </>
      ) : null}
      {row.relation ? (
        <p className="text-[12.5px] text-ink-2">
          {RELATION_LABEL[row.relation]}
          {row.at ? ` · ${formatClock(row.at)}` : ""}
        </p>
      ) : null}
    </li>
  );
}

interface TicketsPanelProps {
  className: string;
  employeeName: string;
  overview: TicketsOverview;
  tickets: ConsoleTickets;
  onRetry: () => void;
}

/** The employee's tickets next to the conversation: the ones it touched first, then the rest. */
export function TicketsPanel({ className, employeeName, overview, tickets, onRetry }: TicketsPanelProps) {
  const first = firstName(employeeName);
  const empty = overview.fromConversation.length === 0 && overview.others.length === 0;

  return (
    <aside aria-label={`Chamados de ${first}`} className={`${className} flex-col bg-desk`}>
      <header className="flex flex-col gap-0.5 border-b border-rule bg-paper px-4 py-3.5">
        <h2 className="text-[15.5px] font-semibold">Chamados de {first}</h2>
        {tickets.state === "ok" ? (
          <p className="text-[12.5px] text-ink-3">
            {overview.open} {overview.open === 1 ? "aberto" : "abertos"} · {overview.closed} {overview.closed === 1 ? "encerrado" : "encerrados"}
          </p>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {tickets.state === "unavailable" ? (
          <p role="status" className="m-4 rounded-lg bg-warning-soft px-3.5 py-3 text-[13px] leading-normal text-warning-text">
            O sistema de chamados não respondeu, então só aparecem os chamados ligados a esta conversa.{" "}
            <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2 hover:no-underline">
              Tentar de novo
            </button>
          </p>
        ) : null}

        {overview.fromConversation.length > 0 ? (
          <Section title="Desta conversa">
            {overview.fromConversation.map((row) => (
              <Row key={row.id} row={row} />
            ))}
          </Section>
        ) : null}

        {overview.others.length > 0 ? (
          <Section title="Outros chamados">
            {overview.others.map((row) => (
              <Row key={row.id} row={row} />
            ))}
          </Section>
        ) : null}

        {empty && tickets.state === "ok" ? <p className="px-6 py-10 text-center text-[13.5px] text-ink-3">{first} não tem chamados.</p> : null}
      </div>
    </aside>
  );
}
