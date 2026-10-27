import { SLA_LABEL } from "@/lib/labels";
import type { HandoffReason } from "@/server/conversations/types";
import { ServiceDeskApiError, ServiceDeskContractError, ServiceDeskUnavailableError } from "@/server/servicedesk/errors";

import type { HandoffPlan, TurnContext } from "./context";
import { groupFor } from "./policy/handoff";
import { runStep } from "./steps";

export interface HandoffRequest {
  reason: HandoffReason;
  summary: string;
  ticketId: string | null;
  auto: boolean;
}

/**
 * Decides who gets the case and how soon they answer. A critical case is answered like a critical
 * ticket (1 hour, 24h on-call); every other handoff gets the high-priority deadline.
 * Nothing changes yet: the plan is applied after the reply is saved.
 */
export function planHandoff(ctx: TurnContext, request: HandoffRequest): Promise<HandoffPlan> {
  const group = groupFor(request.reason);
  const urgency = request.reason === "critical" ? "critica" : "alta";
  return runStep(
    ctx,
    { tool: "transfer_to_analyst", input: { reason: request.reason, group, ...(request.ticketId ? { ticketId: request.ticketId } : {}) } },
    async () => {
      let respondBy: string | null = null;
      let respondByLabel: string = SLA_LABEL[urgency];
      try {
        const preview = await ctx.deps.serviceDesk.getSla(urgency);
        respondBy = preview.dueAt;
        respondByLabel = preview.label;
      } catch (error) {
        if (!isServiceDeskTrouble(error)) throw error; // the label is a fixed rule; only the exact time is lost
        ctx.toolErrors += 1;
      }
      return { reason: request.reason, group, summary: request.summary, ticketId: request.ticketId, respondBy, respondByLabel, auto: request.auto };
    },
    (plan) => `Suporte ${plan.group}, resposta em até ${plan.respondByLabel}`,
  );
}

function isServiceDeskTrouble(error: unknown): boolean {
  return (
    error instanceof ServiceDeskUnavailableError || error instanceof ServiceDeskContractError || error instanceof ServiceDeskApiError
  );
}

/** Marks the ticket as handed to the analysts too. Best effort: the conversation handoff must not depend on it. */
export async function transferTicketForHandoff(ctx: TurnContext, plan: HandoffPlan): Promise<{ ok: boolean }> {
  if (!plan.ticketId) return { ok: true };
  try {
    await ctx.deps.serviceDesk.transferTicket(
      ctx.employee.email,
      plan.ticketId,
      { toGroup: plan.group, reason: plan.reason, summary: plan.summary },
      `handoff-${ctx.turnId}`,
    );
    ctx.deps.conversations.linkTicket(ctx.conversationId, plan.ticketId, "transferred");
    return { ok: true };
  } catch (error) {
    if (!isServiceDeskTrouble(error)) throw error;
    return { ok: false };
  }
}
