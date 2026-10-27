export type ConversationErrorCode =
  | "not_found"
  | "closed"
  | "limit_reached"
  | "agent_paused"
  | "not_assignee"
  | "invalid_transition"
  | "active_exists";

export class ConversationError extends Error {
  constructor(
    readonly code: ConversationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ConversationError";
  }
}
