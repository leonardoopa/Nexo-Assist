import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { runStep } from "../steps";
import { compactTicket, toolFailure, truncate, turnOf } from "./shared";

export const listMyTickets = createTool({
  id: "list_my_tickets",
  description:
    "List the signed-in employee's OWN tickets. Use it to answer 'how is my ticket', to let the employee choose one when they do not remember the number, " +
    "and ALWAYS before drafting a new ticket, to look for an open ticket about the same problem. Other people's tickets never appear.",
  inputSchema: z.object({
    status: z.enum(["open", "closed", "all"]).optional().describe("Default open (includes approved requests and tickets with an analyst)."),
    query: z.string().max(200).optional().describe("Words describing the problem, to rank similar tickets first."),
    limit: z.number().int().min(1).max(10).optional(),
  }),
  execute: async (input, context) => {
    const ctx = turnOf(context);
    const status = input.status ?? "open";
    try {
      const list = await runStep(
        ctx,
        { tool: "list_my_tickets", input: { status, ...(input.query ? { query: input.query } : {}) } },
        () => ctx.deps.serviceDesk.listTickets(ctx.employee.email, { status, q: input.query, limit: input.limit ?? 6 }),
        (result) => `${result.total} chamado(s)`,
      );
      ctx.seen.ticketLookups = true;
      for (const ticket of list.items) ctx.seen.tickets.set(ticket.id, ticket);
      ctx.seen.lastListIds = list.items.map((ticket) => ticket.id);
      return { ok: true as const, total: list.total, tickets: list.items.map(compactTicket) };
    } catch (error) {
      return toolFailure(ctx, error);
    }
  },
});

export const getTicket = createTool({
  id: "get_ticket",
  description:
    "Get one of the employee's own tickets by number (e.g. INC-20311): status, history and the deadline calculation (is it overdue?). " +
    "If it comes back not found, the ticket does not exist among THEIR tickets; say exactly that and never hint it may belong to someone else.",
  inputSchema: z.object({ ticketId: z.string().min(3).max(20).describe("Ticket number such as INC-20311 or REQ-10442.") }),
  execute: async ({ ticketId }, context) => {
    const ctx = turnOf(context);
    const id = ticketId.trim().toUpperCase();
    try {
      const ticket = await runStep(
        ctx,
        { tool: "get_ticket", subject: id, input: { ticketId: id } },
        () => ctx.deps.serviceDesk.getTicket(ctx.employee.email, id),
        (found) => (found ? `${found.id}: ${found.status}` : "Não encontrado entre os chamados do funcionário"),
      );
      ctx.seen.ticketLookups = true;
      if (!ticket) {
        ctx.seen.notFoundIds.add(id);
        return { ok: true as const, found: false as const, ticketId: id, note: "Não existe entre os chamados deste funcionário." };
      }
      ctx.seen.tickets.set(id, ticket);
      ctx.deps.conversations.linkTicket(ctx.conversationId, id, "consulted");

      const deadline = await runStep(
        ctx,
        { tool: "calculate_deadline", input: { ticketId: id } },
        async () => ({
          label: ticket.sla.label,
          dueAt: ticket.sla.dueAt,
          overdue: ticket.sla.overdue,
          overdueByDays: Math.floor(ticket.sla.overdueByMinutes / 1440),
          clockRunning: ticket.sla.clockRunning,
          lastResponseAt: ticket.lastResponseAt,
        }),
        (result) => (result.overdue ? `Vencido (prazo ${result.label})` : `Dentro do prazo (${result.label})`),
      );
      return {
        ok: true as const,
        found: true as const,
        ticket: {
          ...compactTicket(ticket),
          description: truncate(ticket.description, 400),
          openedAt: ticket.createdAt,
          assignedGroup: ticket.assignedGroup,
          reopenUntil: ticket.reopenUntil,
          resolution: ticket.resolution ? truncate(ticket.resolution, 300) : null,
          recentEvents: ticket.events.slice(-4).map((event) => ({ kind: event.kind, at: event.at, text: truncate(event.text, 160) })),
        },
        deadline,
      };
    } catch (error) {
      return toolFailure(ctx, error);
    }
  },
});
