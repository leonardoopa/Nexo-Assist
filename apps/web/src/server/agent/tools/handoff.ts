import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { SLA_LABEL } from "@/lib/labels";
import { handoffReasonSchema } from "@/server/conversations/types";

import { groupFor, validateHandoff } from "../policy/handoff";
import { runStep } from "../steps";
import { findOwnTicket, toolFailure, turnOf } from "./shared";

export const transferToAnalyst = createTool({
  id: "transfer_to_analyst",
  description:
    "Hand the conversation to a human analyst. Use it when the employee asks for a person (employee_request), when classify_priority returned critical (critical), " +
    "when a ticket is past its deadline and the employee wants action (overdue, needs ticketId), or when you are not sure what to do and a question will not fix it (low_confidence). " +
    "The system carries your summary to the analyst. After this call write the reply: say who will answer and how soon.",
  inputSchema: z.object({
    reason: handoffReasonSchema.describe(
      "employee_request: the employee asked for a person. critical: classify_priority returned critica. overdue: the ticket is past its deadline. low_confidence: you cannot decide.",
    ),
    summary: z.string().min(10).max(600).describe("For the analyst: who, what happened, what was already tried, and what the employee wants. Self-contained."),
    ticketId: z.string().max(20).optional().describe("The ticket this is about, if any (required for overdue)."),
  }),
  execute: async ({ reason, summary, ticketId }, context) => {
    const ctx = turnOf(context);
    try {
      const ticket = ticketId ? await findOwnTicket(ctx, ticketId) : null;
      if (ticketId && !ticket) {
        return { ok: false as const, error: "ticket_not_found", message: "Not among this employee's tickets." };
      }
      const verdict = validateHandoff({
        reason,
        ticket,
        criticalClassified: ctx.priority?.decision.priority === "critica",
      });
      if (!verdict.ok) return { ok: false as const, error: "handoff_not_allowed", message: verdict.message };

      const group = groupFor(reason);
      const urgency = reason === "critical" ? "critica" : "alta";
      const plan = await runStep(
        ctx,
        { tool: "transfer_to_analyst", input: { reason, group, ...(ticket ? { ticketId: ticket.id } : {}) } },
        async () => {
          let respondBy: string | null = null;
          let respondByLabel: string = SLA_LABEL[urgency];
          try {
            const preview = await ctx.deps.serviceDesk.getSla(urgency);
            respondBy = preview.dueAt;
            respondByLabel = preview.label;
          } catch (error) {
            toolFailure(ctx, error); // keep the fixed label; only the exact time is lost
          }
          return { reason, group, summary, ticketId: ticket?.id ?? null, respondBy, respondByLabel, auto: false };
        },
        (result) => `Suporte ${result.group}, resposta em até ${result.respondByLabel}`,
      );
      ctx.handoff = plan;
      return {
        ok: true as const,
        status: "transfer_scheduled" as const,
        group,
        expectedResponse: plan.respondByLabel,
        next: "Tell the employee you are handing the case to an analyst, which group, and how soon they will be answered. The agent will be silent afterwards.",
      };
    } catch (error) {
      return toolFailure(ctx, error);
    }
  },
});
