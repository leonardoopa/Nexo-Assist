import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { PRIORITY_LABEL } from "@/lib/labels";
import { draftLabel } from "@/server/drafts/store";
import { affectedSchema, categorySchema, ticketTypeSchema } from "@/server/servicedesk/schemas";

import { supersedePendingDrafts } from "../drafts";
import { findDuplicateCandidates } from "../policy/duplicates";
import { runStep } from "../steps";
import { findOwnTicket, toolFailure, turnOf } from "./shared";

const REQUIRED = ["title", "description", "type", "category", "affected"] as const;

const draftFields = z.object({
  title: z.string().trim().min(5, "título curto demais").max(120, "título longo demais"),
  description: z.string().trim().min(15, "descrição curta demais").max(2000, "descrição longa demais"),
  type: ticketTypeSchema,
  category: categorySchema,
  subcategory: z.string().trim().max(60).optional(),
  affected: affectedSchema,
});

export const draftTicket = createTool({
  id: "draft_ticket",
  description:
    "Prepare a DRAFT of a new ticket for the employee to review. Nothing is created until the employee confirms with the buttons or by writing 'sim'. " +
    "Call classify_priority first. Required: title, description, type, category and affected; if something is missing the tool tells you what to ask, and you must never guess 'affected'. " +
    "If an open ticket already covers the problem the tool refuses and you should offer draft_ticket_update instead; set confirmedDistinct only after the employee said it is a different problem.",
  inputSchema: z.object({
    title: z.string().max(160).optional().describe("Short and specific, e.g. 'VPN não conecta no notebook — erro 809'."),
    description: z
      .string()
      .max(2500)
      .optional()
      .describe("What is happening, since when, error messages, equipment, impact and any commitment today. Write it so an analyst does not need to ask again."),
    type: ticketTypeSchema.optional().describe("INC or REQ, the same used in classify_priority."),
    category: categorySchema.optional(),
    subcategory: z.string().max(60).optional().describe("Optional detail such as Notebook, SAP or Wi-Fi."),
    affected: affectedSchema.optional().describe("As the employee said it; the same used in classify_priority."),
    confirmedDistinct: z.boolean().optional().describe("True only if the employee confirmed this is NOT the same problem as an open ticket."),
  }),
  execute: async (input, context) => {
    const ctx = turnOf(context);
    if (!ctx.priority) {
      return { ok: false as const, error: "priority_not_classified", message: "Call classify_priority with the facts before drafting." };
    }
    const missing = REQUIRED.filter((key) => input[key] === undefined || input[key] === "");
    if (missing.length > 0) {
      return {
        ok: false as const,
        error: "missing_information",
        missing,
        message: `Ask the employee for: ${missing.join(", ")}. Ask one thing at a time and never assume 'affected'.`,
      };
    }
    const parsed = draftFields.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false as const,
        error: "invalid_fields",
        problems: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      };
    }
    const fields = parsed.data;
    if (fields.type !== ctx.priority.facts.type || fields.affected !== ctx.priority.facts.affected) {
      return {
        ok: false as const,
        error: "inconsistent_with_classification",
        message: "type and affected must be the same facts given to classify_priority. Classify again with the final facts.",
      };
    }

    try {
      const open = await runStep(
        ctx,
        { tool: "check_duplicates", input: { category: fields.category } },
        () => ctx.deps.serviceDesk.listTickets(ctx.employee.email, { status: "open", limit: 50 }),
        (result) => `${result.total} chamado(s) aberto(s) conferido(s)`,
      );
      ctx.seen.ticketLookups = true;
      for (const ticket of open.items) ctx.seen.tickets.set(ticket.id, ticket);

      const candidates = findDuplicateCandidates(fields, open.items);
      const blocking = candidates.filter((candidate) => candidate.blocking);
      if (blocking.length > 0 && !input.confirmedDistinct) {
        ctx.duplicateBlocked = blocking.map((candidate) => candidate.ticketId);
        return {
          ok: false as const,
          error: "possible_duplicate",
          message:
            "An open ticket already seems to cover this problem. Offer to add the information to it with draft_ticket_update. " +
            "If the employee says it is a different problem, call draft_ticket again with confirmedDistinct=true.",
          candidates: blocking.map((candidate) => ({ id: candidate.ticketId, title: candidate.title, status: candidate.status })),
        };
      }

      supersedePendingDrafts(ctx);
      const draft = await runStep(
        ctx,
        { tool: "draft_ticket", input: { category: fields.category, type: fields.type, priority: ctx.priority.decision.priority } },
        async () =>
          ctx.deps.drafts.create(ctx.conversationId, {
            kind: "ticket_create",
            payload: {
              title: fields.title,
              description: fields.description,
              type: fields.type,
              category: fields.category,
              subcategory: fields.subcategory ?? null,
              priority: ctx.priority!.decision.priority,
              affected: fields.affected,
              slaLabel: ctx.priority!.slaLabel,
              dueAt: ctx.priority!.dueAt,
              similar: candidates.slice(0, 3).map((candidate) => ({ id: candidate.ticketId, title: candidate.title })),
            },
          }),
        (created) => `Rascunho ${draftLabel(created.id)} aguardando confirmação`,
      );
      ctx.drafts.push(draft);
      return {
        ok: true as const,
        draftId: draft.id,
        label: draftLabel(draft.id),
        status: "pending_confirmation" as const,
        priority: PRIORITY_LABEL[ctx.priority.decision.priority],
        firstResponse: ctx.priority.slaLabel,
        similarOpenTickets: candidates.slice(0, 3).map((candidate) => ({ id: candidate.ticketId, title: candidate.title })),
        next: "Nothing exists yet. Tell the employee to review the draft card and confirm; the card shows every field.",
      };
    } catch (error) {
      return toolFailure(ctx, error);
    }
  },
});

export const draftTicketUpdate = createTool({
  id: "draft_ticket_update",
  description:
    "Prepare a DRAFT that adds information to one of the employee's open tickets (instead of opening a duplicate). Nothing changes until the employee confirms.",
  inputSchema: z.object({
    ticketId: z.string().min(3).max(20),
    text: z.string().trim().min(5).max(1500).describe("The new information, in the employee's words, clear enough for an analyst without the chat."),
  }),
  execute: async ({ ticketId, text }, context) => {
    const ctx = turnOf(context);
    const id = ticketId.trim().toUpperCase();
    try {
      const ticket = await findOwnTicket(ctx, id);
      ctx.seen.ticketLookups = true;
      if (!ticket) {
        return { ok: false as const, error: "ticket_not_found", message: "Not among this employee's tickets." };
      }
      if (ticket.status === "resolvido") {
        return {
          ok: false as const,
          error: "ticket_resolved",
          canReopen: ticket.canReopen,
          message: ticket.canReopen
            ? "The ticket is resolved but can still be reopened: offer draft_reopen_ticket."
            : "The ticket was resolved more than 7 days ago and cannot be reopened: offer to open a new ticket.",
        };
      }
      supersedePendingDrafts(ctx);
      const draft = await runStep(
        ctx,
        { tool: "draft_ticket_update", subject: id, input: { ticketId: id } },
        async () => ctx.deps.drafts.create(ctx.conversationId, { kind: "ticket_update", payload: { ticketId: id, text } }),
        (created) => `Rascunho ${draftLabel(created.id)} aguardando confirmação`,
      );
      ctx.drafts.push(draft);
      return {
        ok: true as const,
        draftId: draft.id,
        label: draftLabel(draft.id),
        status: "pending_confirmation" as const,
        overdue: ticket.sla.overdue,
        next: "Nothing was changed yet. Tell the employee to confirm the update on the card.",
      };
    } catch (error) {
      return toolFailure(ctx, error);
    }
  },
});

export const draftReopenTicket = createTool({
  id: "draft_reopen_ticket",
  description:
    "Prepare a DRAFT to reopen a ticket that was resolved up to 7 days ago and came back. Nothing changes until the employee confirms.",
  inputSchema: z.object({
    ticketId: z.string().min(3).max(20),
    reason: z.string().trim().min(5).max(500).describe("Why it came back, in the employee's words."),
  }),
  execute: async ({ ticketId, reason }, context) => {
    const ctx = turnOf(context);
    const id = ticketId.trim().toUpperCase();
    try {
      const ticket = await findOwnTicket(ctx, id);
      ctx.seen.ticketLookups = true;
      if (!ticket) {
        return { ok: false as const, error: "ticket_not_found", message: "Not among this employee's tickets." };
      }
      if (ticket.status !== "resolvido") {
        return { ok: false as const, error: "not_resolved", message: "Only resolved tickets can be reopened; this one is still open: offer draft_ticket_update." };
      }
      if (!ticket.canReopen) {
        return {
          ok: false as const,
          error: "reopen_window_expired",
          message: "Resolved more than 7 days ago, so it cannot be reopened. Offer to open a new ticket.",
        };
      }
      supersedePendingDrafts(ctx);
      const draft = await runStep(
        ctx,
        { tool: "draft_reopen_ticket", subject: id, input: { ticketId: id } },
        async () => ctx.deps.drafts.create(ctx.conversationId, { kind: "ticket_reopen", payload: { ticketId: id, reason } }),
        (created) => `Rascunho ${draftLabel(created.id)} aguardando confirmação`,
      );
      ctx.drafts.push(draft);
      return {
        ok: true as const,
        draftId: draft.id,
        label: draftLabel(draft.id),
        status: "pending_confirmation" as const,
        next: "Nothing was reopened yet. Tell the employee to confirm on the card.",
      };
    } catch (error) {
      return toolFailure(ctx, error);
    }
  },
});
