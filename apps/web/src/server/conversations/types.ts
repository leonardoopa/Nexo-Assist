import { z } from "zod";

import type { SupportGroup } from "@/lib/domain";

/**
 * Who is handling a conversation:
 * - `agent`: the assistant answers;
 * - `awaiting_analyst`: handed off, the assistant stays silent until an analyst takes it;
 * - `with_analyst`: an analyst took over and the assistant is paused;
 * - `closed`: finished; the employee's next message starts a new conversation.
 */
export type ConversationStatus = "agent" | "awaiting_analyst" | "with_analyst" | "closed";

/** Why the agent handed a conversation to a person (Annex A, "Transferência"). */
export type HandoffReason = "employee_request" | "critical" | "overdue" | "low_confidence";

export type ClosedBy = "agent" | "analyst";
export type MessageRole = "user" | "assistant" | "analyst" | "system";
export type ConsoleTab = "all" | "for_you" | "agent" | "mine";

export interface EmployeeRef {
  email: string;
  name: string;
  department: string | null;
}

export interface AnalystRef {
  email: string;
  name: string;
}

export interface Handoff {
  reason: HandoffReason;
  group: SupportGroup;
  summary: string;
  at: string;
  respondBy: string | null;
}

export interface Conversation {
  id: string;
  employee: EmployeeRef;
  status: ConversationStatus;
  handoff: Handoff | null;
  assignee: AnalystRef | null;
  /** User and assistant messages: the number the 30-message limit counts. */
  messageCount: number;
  analystUnread: number;
  lastMessage: { at: string; preview: string; role: Exclude<MessageRole, "system"> } | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  closedBy: ClosedBy | null;
}

/** Structured pieces attached to a message. The union grows with the chat (cards, drafts, quick replies). */
export const eventPartSchema = z.object({
  type: z.literal("event"),
  kind: z.enum(["handoff", "assumed", "returned_to_agent", "closed"]),
  data: z.record(z.string(), z.string()),
});
export const messagePartSchema = z.discriminatedUnion("type", [eventPartSchema]);
export type MessagePart = z.infer<typeof messagePartSchema>;

export interface Message {
  id: string;
  conversationId: string;
  seq: number;
  role: MessageRole;
  author: { email: string; name: string } | null;
  content: string;
  parts: MessagePart[];
  createdAt: string;
}

export interface AppendMessageInput {
  role: MessageRole;
  content: string;
  author?: { email: string; name: string };
  parts?: MessagePart[];
}

export interface HandoffInput {
  reason: HandoffReason;
  group: SupportGroup;
  summary: string;
  respondBy?: string | null;
}

export interface ConsoleQuery {
  tab: ConsoleTab;
  analystEmail: string;
  search?: string;
  limit?: number;
}
