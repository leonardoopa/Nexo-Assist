import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { PRIORITY_LABEL, SLA_LABEL } from "@/lib/labels";
import { affectedSchema, ticketTypeSchema } from "@/server/servicedesk/schemas";

import { classifyPriority } from "../policy/priority";
import { runStep } from "../steps";
import { toolFailure, turnOf } from "./shared";

export const classifyPriorityTool = createTool({
  id: "classify_priority",
  description:
    "Decide the priority of a problem from facts. YOU report the facts; the system applies the service desk table (impact x urgency) and looks up the deadline. " +
    "Never pick a priority yourself. Call it before draft_ticket, once you know who is affected and whether it blocks the employee or a commitment today.",
  inputSchema: z.object({
    type: ticketTypeSchema.describe("INC: something stopped working. REQ: request for access, equipment or software."),
    affected: affectedSchema.describe("me: only the employee. team. company. unknown: the employee does not know."),
    blocking: z.boolean().describe("The employee cannot do their work because of this."),
    commitmentToday: z.boolean().describe("A commitment (meeting, delivery) today depends on this."),
  }),
  execute: async (facts, context) => {
    const ctx = turnOf(context);
    const decision = await runStep(
      ctx,
      { tool: "classify_priority", input: { ...facts } },
      async () => classifyPriority(facts),
      (result) => `Prioridade ${PRIORITY_LABEL[result.priority].toLowerCase()}: ${result.rationale}`,
    );

    let sla = { label: SLA_LABEL[decision.priority], dueAt: null as string | null, businessHours: decision.priority !== "critica" };
    try {
      const preview = await runStep(
        ctx,
        { tool: "get_sla", input: { priority: decision.priority } },
        () => ctx.deps.serviceDesk.getSla(decision.priority),
        (result) => `Primeira resposta em até ${result.label}`,
      );
      sla = { label: preview.label, dueAt: preview.dueAt, businessHours: preview.businessHours };
    } catch (error) {
      toolFailure(ctx, error); // the deadline label is a fixed rule; only the exact date is lost
    }

    ctx.priority = { facts, decision, slaLabel: sla.label, dueAt: sla.dueAt };
    return {
      ok: true as const,
      priority: decision.priority,
      priorityLabel: PRIORITY_LABEL[decision.priority],
      rule: decision.rule,
      rationale: decision.rationale,
      firstResponse: sla,
    };
  },
});
