import type { AgentDeps } from "@/server/agent/context";

import { toConversationView, toMessageView, type ConversationView, type MessageView } from "./view";

export interface ChatState {
  conversation: ConversationView | null;
  messages: MessageView[];
  /** The draft waiting for the employee's decision, if any. */
  pendingDraftId: number | null;
}

export type ChatDeps = Pick<AgentDeps, "conversations" | "decisions" | "drafts">;

/** A conversation that ended stays on screen for a while, so the employee sees how it ended. */
const CLOSED_VISIBLE_MS = 12 * 60 * 60 * 1000;

/** The employee's current conversation with every message and the decision behind each answer. */
export function loadChat(deps: ChatDeps, employeeEmail: string, now: Date = new Date()): ChatState {
  const { conversations, decisions, drafts } = deps;
  const latest = conversations.findLatest(employeeEmail);
  const closedLongAgo = latest?.status === "closed" && (!latest.closedAt || now.getTime() - new Date(latest.closedAt).getTime() > CLOSED_VISIBLE_MS);
  if (!latest || closedLongAgo) return { conversation: null, messages: [], pendingDraftId: null };

  const explained = decisions.forConversation(latest.id);
  return {
    conversation: toConversationView(latest, conversations.messageLimit),
    messages: conversations.messages(latest.id).map((message) => toMessageView(message, explained.get(message.id) ?? null)),
    pendingDraftId: drafts.pending(latest.id)?.id ?? null,
  };
}
