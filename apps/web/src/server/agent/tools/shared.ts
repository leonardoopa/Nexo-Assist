import type { TicketSnapshot } from "@/server/conversations/types";
import { ServiceDeskApiError, ServiceDeskContractError, ServiceDeskUnavailableError } from "@/server/servicedesk/errors";
import type { Ticket } from "@/server/servicedesk/schemas";

import type { TurnContext } from "../context";

/** Key under which the turn travels in Mastra's request context. */
export const TURN_KEY = "turn";

interface WithRequestContext {
  requestContext?: { get(key: string): unknown };
}

/** Who is asking and what this turn has gathered: always read from the server, never from what the model says. */
export function turnOf(context: WithRequestContext | undefined): TurnContext {
  const turn = context?.requestContext?.get(TURN_KEY);
  if (!turn) throw new Error("Contexto do turno ausente: a tool foi chamada fora de um turno do agent.");
  return turn as TurnContext;
}

export interface ToolFailure {
  ok: false;
  error: string;
  message: string;
}

/**
 * Service desk trouble becomes a result the model can explain to the employee. Anything else
 * is a bug and keeps throwing. Only outages and broken contracts count against confidence;
 * a business refusal ("reopen window expired") is a normal answer.
 */
export function toolFailure(ctx: TurnContext, error: unknown): ToolFailure {
  if (error instanceof ServiceDeskUnavailableError || error instanceof ServiceDeskContractError) {
    ctx.toolErrors += 1;
    return {
      ok: false,
      error: "service_unavailable",
      message:
        "O sistema de chamados está instável agora. Diga ao funcionário que tente de novo em instantes e nunca afirme que algo foi feito.",
    };
  }
  if (error instanceof ServiceDeskApiError) return { ok: false, error: error.code, message: error.message };
  throw error;
}

export const truncate = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** The small view of a ticket that goes back to the model: enough to reason, nothing more. */
export function compactTicket(ticket: Ticket) {
  return {
    id: ticket.id,
    type: ticket.type,
    title: ticket.title,
    category: ticket.category,
    subcategory: ticket.subcategory,
    priority: ticket.priority,
    status: ticket.status,
    openedAt: ticket.createdAt,
    lastResponseAt: ticket.lastResponseAt,
    slaLabel: ticket.sla.label,
    overdue: ticket.sla.overdue,
    canReopen: ticket.canReopen,
    ...(ticket.matchScore !== null ? { matchScore: ticket.matchScore } : {}),
  };
}

/** The ticket as it is stored in a message part, so the history does not depend on the service desk being up. */
export function snapshotOf(ticket: Ticket, withDescription = false): TicketSnapshot {
  return {
    id: ticket.id,
    type: ticket.type,
    title: ticket.title,
    ...(withDescription ? { description: ticket.description } : {}),
    category: ticket.category,
    subcategory: ticket.subcategory,
    priority: ticket.priority,
    status: ticket.status,
    createdAt: ticket.createdAt,
    lastResponseAt: ticket.lastResponseAt,
    dueAt: ticket.sla.dueAt,
    slaLabel: ticket.sla.label,
    overdue: ticket.sla.overdue,
    clockRunning: ticket.sla.clockRunning,
  };
}

/** Finds a ticket of this employee: already seen in the turn, or asked of the service desk (which hides other people's). */
export async function findOwnTicket(ctx: TurnContext, ticketId: string): Promise<Ticket | null> {
  const id = ticketId.trim().toUpperCase();
  const known = ctx.seen.tickets.get(id);
  if (known) return known;
  const fetched = await ctx.deps.serviceDesk.getTicket(ctx.employee.email, id);
  if (!fetched) {
    ctx.seen.notFoundIds.add(id);
    return null;
  }
  ctx.seen.tickets.set(id, fetched);
  return fetched;
}
