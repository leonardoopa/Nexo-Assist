export type ConversationErrorCode =
  | "not_found"
  | "closed"
  | "limit_reached"
  | "agent_paused"
  | "not_assignee"
  | "invalid_transition"
  | "active_exists";

/** The HTTP status that goes with each rule a conversation can refuse to bend. */
export const CONVERSATION_ERROR_STATUS: Record<ConversationErrorCode, number> = {
  not_found: 404,
  not_assignee: 403,
  closed: 409,
  limit_reached: 409,
  agent_paused: 409,
  invalid_transition: 409,
  active_exists: 409,
};

export class ConversationError extends Error {
  constructor(
    readonly code: ConversationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ConversationError";
  }
}
