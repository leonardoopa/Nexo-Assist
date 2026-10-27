import type { DecisionRecord } from "@/server/agent/decision";
import type { Conversation, Message, MessagePart } from "@/server/conversations/types";

/** A message as the screens receive it: the stored message plus the decision that explains it. */
export interface MessageView {
  id: string;
  seq: number;
  role: Message["role"];
  authorName: string | null;
  content: string;
  parts: MessagePart[];
  createdAt: string;
  decision: DecisionRecord | null;
}

export interface ConversationView {
  id: string;
  status: Conversation["status"];
  handoff: Conversation["handoff"];
  assigneeName: string | null;
  messageCount: number;
  messageLimit: number;
  closedAt: string | null;
}

export function toMessageView(message: Message, decision: DecisionRecord | null): MessageView {
  return {
    id: message.id,
    seq: message.seq,
    role: message.role,
    authorName: message.author?.name ?? null,
    content: message.content,
    parts: message.parts,
    createdAt: message.createdAt,
    decision,
  };
}

export function toConversationView(conversation: Conversation, messageLimit: number): ConversationView {
  return {
    id: conversation.id,
    status: conversation.status,
    handoff: conversation.handoff,
    assigneeName: conversation.assignee?.name ?? null,
    messageCount: conversation.messageCount,
    messageLimit,
    closedAt: conversation.closedAt,
  };
}
