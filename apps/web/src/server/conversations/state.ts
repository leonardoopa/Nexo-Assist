import { ConversationError } from "./errors";
import type { ConversationStatus, MessageRole } from "./types";

export type Transition = "handoff" | "assume" | "return_to_agent" | "close";

const TRANSITIONS: Record<ConversationStatus, Partial<Record<Transition, ConversationStatus>>> = {
  agent: { handoff: "awaiting_analyst", close: "closed" },
  awaiting_analyst: { assume: "with_analyst" },
  with_analyst: { return_to_agent: "agent", close: "closed" },
  closed: {},
};

/** The status a conversation moves to, or an error when the move is not allowed from where it is. */
export function transition(current: ConversationStatus, name: Transition): ConversationStatus {
  const next = TRANSITIONS[current][name];
  if (!next) {
    throw new ConversationError("invalid_transition", `Não dá para aplicar "${name}" a uma conversa em "${current}".`);
  }
  return next;
}

/** The assistant stays silent while a person owns the conversation. */
export const agentMayReply = (status: ConversationStatus): boolean => status === "agent";

/** Only the employee's and the assistant's messages count against the per-session limit. */
export const countsTowardLimit = (role: MessageRole): boolean => role === "user" || role === "assistant";
