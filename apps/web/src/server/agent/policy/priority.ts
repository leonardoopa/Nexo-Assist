import type { Affected, Priority, TicketType } from "@/server/servicedesk/schemas";

/** The facts Annex A says priority is made of: impact (how many people) and urgency (a commitment at risk). */
export interface PriorityFacts {
  type: TicketType;
  affected: Affected;
  /** The employee cannot do their work because of this. */
  blocking: boolean;
  /** A commitment depends on it today. */
  commitmentToday: boolean;
}

export type PriorityRule = "team_blocked" | "person_blocked" | "commitment_today" | "request_without_urgency" | "default";

export interface PriorityDecision {
  priority: Priority;
  rule: PriorityRule;
  rationale: string;
}

/**
 * Priority is decided here, never by the model: the model only reports the facts. The table is
 * Annex A: critical = stopped for a team or the company; high = stops one person or a same-day
 * commitment; medium = bothers but has an alternative; low = requests and improvements.
 */
export function classifyPriority(facts: PriorityFacts): PriorityDecision {
  const wide = facts.affected === "team" || facts.affected === "company";
  const unknownNote = facts.affected === "unknown" ? " Não sei quantas pessoas são afetadas, então considerei só você." : "";

  if (facts.blocking && wide) {
    return {
      priority: "critica",
      rule: "team_blocked",
      rationale: "Algo está parado para uma equipe ou para a empresa.",
    };
  }
  if (facts.blocking) {
    return { priority: "alta", rule: "person_blocked", rationale: `Impede uma pessoa de trabalhar.${unknownNote}` };
  }
  if (facts.commitmentToday) {
    return { priority: "alta", rule: "commitment_today", rationale: `Há um compromisso no mesmo dia.${unknownNote}` };
  }
  if (facts.type === "REQ") {
    return { priority: "baixa", rule: "request_without_urgency", rationale: "Pedido sem urgência." };
  }
  return { priority: "media", rule: "default", rationale: `Atrapalha, mas há alternativa.${unknownNote}` };
}
