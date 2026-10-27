import { dayKey, formatDayLabel, formatUntil } from "@/lib/format";
import type { MessageView } from "@/server/chat/view";
import type { ConsoleDetail, ConsoleItem, ConsoleTicket, ConsoleTickets } from "@/server/console/view";
import type { TicketRelation } from "@/server/conversations/types";

export type Tone = "warning" | "info" | "neutral" | "success" | "danger";

/** The line under a conversation in the list: who has it, and what it is waiting for. */
export function itemStatus(item: ConsoleItem, me: string, now: Date = new Date()): { text: string; tone: Tone } {
  switch (item.status) {
    case "awaiting_analyst": {
      const { handoff } = item;
      const late = handoff?.respondBy ? new Date(handoff.respondBy) < now : false;
      if (handoff?.reason === "low_confidence") {
        const confidence = item.agentConfidence === null ? "" : ` · confiança ${Math.round(item.agentConfidence * 100)}%`;
        return { text: `Agent pediu ajuda${confidence}`, tone: late ? "danger" : "warning" };
      }
      const parts = ["Transferida"];
      if (item.ticketId) parts.push(item.ticketId);
      if (handoff?.respondBy) parts.push(late ? "resposta atrasada" : `resposta ${formatUntil(handoff.respondBy, now)}`);
      return { text: parts.join(" · "), tone: late ? "danger" : "warning" };
    }
    case "with_analyst":
      return item.assignee?.email === me
        ? { text: "Você está atendendo", tone: "info" }
        : { text: `Atendendo: ${item.assignee?.name ?? "outro analista"}`, tone: "neutral" };
    case "agent":
      return { text: item.ticketId ? `Agent atendendo · ${item.ticketId}` : "Agent atendendo", tone: "neutral" };
    case "closed":
      return item.closedBy === "agent"
        ? { text: "Resolvida pelo agent", tone: "success" }
        : { text: `Encerrada${item.assignee ? ` por ${item.assignee.name}` : ""}`, tone: "neutral" };
  }
}

/** What the list shows of the last message, saying who wrote it when it was not the employee. */
export function previewOf(item: ConsoleItem, me: string): string {
  const last = item.lastMessage;
  if (!last) return "Sem mensagens";
  switch (last.role) {
    case "assistant":
      return `Agent: ${last.preview}`;
    case "analyst":
      return `${item.assignee?.email === me ? "Você" : "Analista"}: ${last.preview}`;
    case "user":
      return last.preview;
  }
}

export const RELATION_LABEL: Record<TicketRelation, string> = {
  transferred: "Transferido para um analista",
  created: "Aberto pelo agent nesta conversa",
  reopened: "Reaberto pelo agent nesta conversa",
  updated: "Atualizado pelo agent nesta conversa",
  consulted: "Consultado pelo agent",
};

// What the conversation did to a ticket, strongest first: it decides how a ticket is described when it did several things.
const RELATION_RANK: readonly TicketRelation[] = ["transferred", "created", "reopened", "updated", "consulted"];

export interface TicketRow {
  id: string;
  /** `null` when the ticket system could not tell, so only the link is shown. */
  ticket: ConsoleTicket | null;
  relation: TicketRelation | null;
  at: string | null;
}

export interface TicketsOverview {
  fromConversation: TicketRow[];
  others: TicketRow[];
  open: number;
  closed: number;
}

/** Splits the employee's tickets into "from this conversation" and the rest, with the counts the panel shows. */
export function ticketsOverview(links: ConsoleDetail["links"], tickets: ConsoleTickets): TicketsOverview {
  const known = new Map((tickets.state === "ok" ? tickets.items : []).map((ticket) => [ticket.id, ticket]));

  const strongest = new Map<string, { relation: TicketRelation; at: string }>();
  for (const link of links) {
    const current = strongest.get(link.ticketId);
    if (!current || RELATION_RANK.indexOf(link.relation) < RELATION_RANK.indexOf(current.relation)) {
      strongest.set(link.ticketId, { relation: link.relation, at: link.at });
    }
  }

  const fromConversation = [...strongest.entries()]
    .map(([id, link]) => ({ id, ticket: known.get(id) ?? null, relation: link.relation, at: link.at }))
    .sort((a, b) => RELATION_RANK.indexOf(a.relation) - RELATION_RANK.indexOf(b.relation) || a.id.localeCompare(b.id));

  const items = tickets.state === "ok" ? tickets.items : [];
  const isOpen = (ticket: ConsoleTicket) => ticket.status !== "resolvido";
  const others = items
    .filter((ticket) => !strongest.has(ticket.id))
    .sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || (b.resolvedAt ?? b.createdAt).localeCompare(a.resolvedAt ?? a.createdAt))
    .map((ticket) => ({ id: ticket.id, ticket, relation: null, at: null }));

  return {
    fromConversation,
    others,
    open: items.filter(isOpen).length,
    closed: items.filter((ticket) => !isOpen(ticket)).length,
  };
}

export interface DayGroup {
  key: string;
  label: string;
  messages: MessageView[];
}

/** Messages grouped by calendar day, for the separators of the transcript. */
export function groupByDay(messages: MessageView[], now: Date = new Date()): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const message of messages) {
    const key = dayKey(message.createdAt);
    const last = groups.at(-1);
    if (last?.key === key) last.messages.push(message);
    else groups.push({ key, label: formatDayLabel(message.createdAt, now), messages: [message] });
  }
  return groups;
}
