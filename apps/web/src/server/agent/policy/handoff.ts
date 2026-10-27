import type { SupportGroup } from "@/lib/domain";
import type { Ticket } from "@/server/servicedesk/schemas";

import type { HandoffReason } from "@/server/conversations/types";

/** Critical and overdue cases go to N2; a person asking, or the agent unsure, starts at N1. */
export function groupFor(reason: HandoffReason): SupportGroup {
  return reason === "critical" || reason === "overdue" ? "N2" : "N1";
}

export interface HandoffCheck {
  reason: HandoffReason;
  /** The ticket the handoff is about, as the service desk returned it for this employee. */
  ticket: Ticket | null;
  /** A critical classification was made in this conversation turn. */
  criticalClassified: boolean;
}

export type HandoffVerdict = { ok: true } | { ok: false; message: string };

/**
 * Annex A lists when the agent may transfer: the employee asks, a critical case, an overdue
 * ticket, or the agent is not sure. The first and last are the model's judgment; the two
 * that rest on facts are verified here so a transfer cannot be justified with a made-up reason.
 */
export function validateHandoff({ reason, ticket, criticalClassified }: HandoffCheck): HandoffVerdict {
  if (reason === "overdue") {
    if (!ticket) {
      return { ok: false, message: "Informe o chamado vencido (ticketId) que motiva a transferência." };
    }
    if (!ticket.sla.overdue) {
      return {
        ok: false,
        message: `O chamado ${ticket.id} não está vencido (prazo: ${ticket.sla.label}). Use outro motivo se o funcionário pediu um analista.`,
      };
    }
  }
  if (reason === "critical" && !criticalClassified) {
    return {
      ok: false,
      message: "Só é crítico quando classify_priority devolveu prioridade crítica nesta conversa. Classifique antes de transferir.",
    };
  }
  return { ok: true };
}
