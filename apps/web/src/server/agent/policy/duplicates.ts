import type { Category, Ticket } from "@/server/servicedesk/schemas";

import { wordSet } from "./text";

export interface DraftSubject {
  title: string;
  description: string;
  category: Category;
}

export interface DuplicateCandidate {
  ticketId: string;
  title: string;
  status: Ticket["status"];
  score: number;
  sameCategory: boolean;
  /** Same category and clearly the same words: creating another ticket would break "no duplicates". */
  blocking: boolean;
}

const MIN_SHARED_WORDS = 2;
const SUSPECT_SCORE = 0.34;
const BLOCKING_SCORE = 0.5;

/** Shared words divided by the words of the shorter text; a single shared word never counts. */
function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  const shared = [...a].filter((word) => b.has(word)).length;
  const smaller = Math.min(a.size, b.size);
  return shared < MIN_SHARED_WORDS || smaller === 0 ? 0 : shared / smaller;
}

/**
 * Overlap of the draft with each open ticket, taking the better of titles-only and full text, so
 * a short new report still matches a long older description. The model is asked to check for
 * duplicates itself; this is the safety net that makes "no duplicates" a rule.
 */
export function findDuplicateCandidates(draft: DraftSubject, openTickets: readonly Ticket[]): DuplicateCandidate[] {
  const draftTitle = wordSet(draft.title);
  const draftFull = wordSet(`${draft.title} ${draft.description}`);
  const candidates: DuplicateCandidate[] = [];

  for (const ticket of openTickets) {
    const ticketTitle = wordSet(`${ticket.title} ${ticket.subcategory ?? ""}`);
    const ticketFull = wordSet(`${ticket.title} ${ticket.subcategory ?? ""} ${ticket.description}`);
    const score = Math.round(Math.max(overlap(draftFull, ticketFull), overlap(draftTitle, ticketTitle)) * 100) / 100;
    const sameCategory = ticket.category === draft.category;
    if (score < SUSPECT_SCORE) continue;
    candidates.push({
      ticketId: ticket.id,
      title: ticket.title,
      status: ticket.status,
      score,
      sameCategory,
      blocking: sameCategory && score >= BLOCKING_SCORE,
    });
  }
  return candidates.sort((a, b) => b.score - a.score);
}
