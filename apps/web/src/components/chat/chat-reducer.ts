import type { TurnEvent } from "@/server/chat/events";
import type { ChatState as ServerChatState } from "@/server/chat/load";
import type { MessageView } from "@/server/chat/view";

export interface LiveStep {
  id: string;
  tool: string;
  label: string;
  status: "running" | "ok" | "error";
  summary?: string;
  durationMs?: number;
}

export interface ChatError {
  code: string;
  message: string;
  retryable: boolean;
}

/** Everything the chat screen shows: what is stored, plus the turn that is running right now. */
export interface ChatState extends ServerChatState {
  turn: { running: boolean; steps: LiveStep[]; text: string };
  error: ChatError | null;
}

export type ChatAction =
  | { type: "turn_started" }
  | { type: "event"; event: TurnEvent }
  | { type: "failed"; error: ChatError }
  | { type: "loaded"; state: ServerChatState }
  | { type: "dismiss_error" };

const idleTurn = { running: false, steps: [] as LiveStep[], text: "" };

export function initialChatState(server: ServerChatState): ChatState {
  return { ...server, turn: idleTurn, error: null };
}

/** The draft still waiting for a decision: the last draft card on screen, if it is pending. */
export function pendingDraftOf(messages: readonly MessageView[]): number | null {
  for (const message of [...messages].reverse()) {
    for (const part of [...message.parts].reverse()) {
      if (part.type === "draft") return part.status === "pending" ? part.draftId : null;
    }
  }
  return null;
}

const withMessage = (messages: MessageView[], message: MessageView): MessageView[] =>
  messages.some((existing) => existing.id === message.id) ? messages : [...messages, message];

function applyEvent(state: ChatState, event: TurnEvent): ChatState {
  switch (event.type) {
    case "conversation":
      return { ...state, conversation: event.conversation };
    case "user_message":
      return { ...state, messages: withMessage(state.messages, event.message) };
    case "step_start":
      return { ...state, turn: { ...state.turn, steps: [...state.turn.steps, { id: event.id, tool: event.tool, label: event.label, status: "running" }] } };
    case "step_end": {
      const finished: LiveStep = { id: event.id, tool: event.tool, label: event.label, status: event.status, summary: event.summary, durationMs: event.durationMs };
      const known = state.turn.steps.some((step) => step.id === event.id);
      const steps = known ? state.turn.steps.map((step) => (step.id === event.id ? finished : step)) : [...state.turn.steps, finished];
      return { ...state, turn: { ...state.turn, steps } };
    }
    case "text":
      return { ...state, turn: { ...state.turn, text: state.turn.text + event.delta } };
    case "assistant_message": {
      // The stored message carries its own steps and decision, so the live ones are dropped.
      const messages = withMessage(state.messages, event.message);
      return { ...state, messages, pendingDraftId: pendingDraftOf(messages), turn: { ...state.turn, steps: [], text: "" } };
    }
    case "error":
      return { ...state, error: { code: event.code, message: event.message, retryable: event.retryable }, turn: { ...state.turn, steps: [], text: "" } };
    case "done":
      return { ...state, turn: { ...state.turn, running: false } };
  }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "turn_started":
      return { ...state, error: null, turn: { running: true, steps: [], text: "" } };
    case "event":
      return applyEvent(state, action.event);
    case "failed":
      return { ...state, error: action.error, turn: idleTurn };
    case "loaded":
      return { ...state, ...action.state };
    case "dismiss_error":
      return { ...state, error: null };
  }
}
