import type { ConversationView, MessageView } from "./view";

export type TurnErrorCode =
  | "conversation_not_found"
  | "conversation_closed"
  | "limit_reached"
  | "turn_in_progress"
  | "draft_not_found"
  | "nothing_to_retry"
  | "llm_not_configured"
  | "llm_unavailable"
  | "llm_timeout"
  | "llm_rate_limited"
  | "internal";

/** What a turn tells the screen while it runs, one JSON object per line. */
export type TurnEvent =
  | { type: "user_message"; message: MessageView }
  | { type: "step_start"; id: string; tool: string; label: string }
  | { type: "step_end"; id: string; tool: string; label: string; status: "ok" | "error"; summary: string; durationMs: number }
  | { type: "text"; delta: string }
  | { type: "assistant_message"; message: MessageView }
  | { type: "conversation"; conversation: ConversationView }
  | { type: "error"; code: TurnErrorCode; message: string; retryable: boolean }
  | { type: "done" };

export const encodeEvent = (event: TurnEvent): string => `${JSON.stringify(event)}\n`;

export function decodeEvents(text: string): TurnEvent[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as TurnEvent);
}
