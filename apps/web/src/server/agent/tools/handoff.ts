import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { handoffReasonSchema } from "@/server/conversations/types";

import { planHandoff } from "../handoff";
import { validateHandoff } from "../policy/handoff";
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
      const verdict = validateHandoff({ reason, ticket, criticalClassified: ctx.priority?.decision.priority === "critica" });
      if (!verdict.ok) return { ok: false as const, error: "handoff_not_allowed", message: verdict.message };

      const plan = await planHandoff(ctx, { reason, summary, ticketId: ticket?.id ?? null, auto: false });
      ctx.handoff = plan;
      return {
        ok: true as const,
        status: "transfer_scheduled" as const,
        group: plan.group,
        expectedResponse: plan.respondByLabel,
        next: "Tell the employee you are handing the case to an analyst, which group, and how soon they will be answered. The agent stays silent afterwards.",
      };
    } catch (error) {
      return toolFailure(ctx, error);
    }
  },
});
