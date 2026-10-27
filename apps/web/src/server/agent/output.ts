import type { TurnErrorCode } from "@/server/chat/events";
import type { MessagePart } from "@/server/conversations/types";

import type { HandoffPlan, TurnContext } from "./context";
import type { DecisionRecord } from "./decision";

/** A failure the screen can show as "something went wrong, try again", with a stable code. */
export class TurnError extends Error {
  constructor(
    readonly code: TurnErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "TurnError";
  }
}

/** What a turn produces: the assistant message, the explanation that goes with it, and what must happen after it is saved. */
export interface AssistantOutput {
  content: string;
  parts: MessagePart[];
  decision: DecisionRecord;
  /** Drafts whose card is part of this message. */
  attachDrafts: number[];
  /** A handoff to apply once the message is stored, so the reply comes before the "transferred" event. */
  handoff: HandoffPlan | null;
  ctx: TurnContext;
}
