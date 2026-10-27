import type { AgentRuntime } from "@/server/agent/runtime";

import { toConversationView, toMessageView, type ConversationView, type MessageView } from "./view";

export interface ChatState {
  conversation: ConversationView | null;
  messages: MessageView[];
  /** The draft waiting for the employee's decision, if any. */
  pendingDraftId: number | null;
}

/** The employee's open conversation with every message and the decision behind each answer. */
export function loadChat(runtime: AgentRuntime, employeeEmail: string): ChatState {
  const { conversations, decisions, drafts } = runtime.deps;
  const open = conversations.findOpen(employeeEmail);
  if (!open) return { conversation: null, messages: [], pendingDraftId: null };

  const explained = decisions.forConversation(open.id);
  return {
    conversation: toConversationView(open, conversations.messageLimit),
    messages: conversations.messages(open.id).map((message) => toMessageView(message, explained.get(message.id) ?? null)),
    pendingDraftId: drafts.pending(open.id)?.id ?? null,
  };
}
