import { z } from "zod";

import type { SupportGroup } from "@/lib/domain";
import {
  affectedSchema,
  categorySchema,
  prioritySchema,
  ticketStatusSchema,
  ticketTypeSchema,
} from "@/server/servicedesk/schemas";

/**
 * Who is handling a conversation:
 * - `agent`: the assistant answers;
 * - `awaiting_analyst`: handed off, the assistant stays silent until an analyst takes it;
 * - `with_analyst`: an analyst took over and the assistant is paused;
 * - `closed`: finished; the employee's next message starts a new conversation.
 */
export type ConversationStatus = "agent" | "awaiting_analyst" | "with_analyst" | "closed";

/** Why the agent handed a conversation to a person (Annex A, "Transferência"). */
export const handoffReasonSchema = z.enum(["employee_request", "critical", "overdue", "low_confidence"]);
export type HandoffReason = z.infer<typeof handoffReasonSchema>;

export type ClosedBy = "agent" | "analyst";
export type TicketRelation = "created" | "updated" | "reopened" | "transferred" | "consulted";
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

/** A ticket as it looked when the agent showed it, so the history renders without asking the service desk again. */
export const ticketSnapshotSchema = z.object({
  id: z.string(),
  type: ticketTypeSchema,
  title: z.string(),
  description: z.string().optional(),
  category: categorySchema,
  subcategory: z.string().nullable(),
  priority: prioritySchema,
  status: ticketStatusSchema,
  createdAt: z.string(),
  lastResponseAt: z.string(),
  dueAt: z.string(),
  slaLabel: z.string(),
  overdue: z.boolean(),
  clockRunning: z.boolean(),
});
export type TicketSnapshot = z.infer<typeof ticketSnapshotSchema>;

export const ticketCardPartSchema = z.object({ type: z.literal("ticket_card"), ticket: ticketSnapshotSchema });
export const ticketPickerPartSchema = z.object({ type: z.literal("ticket_picker"), tickets: z.array(ticketSnapshotSchema) });
export const quickRepliesPartSchema = z.object({ type: z.literal("quick_replies"), options: z.array(z.string()) });

export const draftStatusSchema = z.enum(["pending", "confirmed", "cancelled", "superseded"]);
export type DraftStatus = z.infer<typeof draftStatusSchema>;

/** The draft shown for confirmation. Its status is rewritten in place when the employee decides. */
export const draftPartSchema = z.object({
  type: z.literal("draft"),
  draftId: z.number().int(),
  kind: z.enum(["ticket_create", "ticket_update", "ticket_reopen"]),
  status: draftStatusSchema,
  /** The ticket an update or reopen targets, or the one a confirmed creation produced. */
  ticketId: z.string().nullable(),
  title: z.string(),
  description: z.string(),
  category: categorySchema.nullable(),
  subcategory: z.string().nullable(),
  priority: prioritySchema.nullable(),
  affected: affectedSchema.nullable(),
  slaLabel: z.string().nullable(),
  dueAt: z.string().nullable(),
  similar: z.array(z.object({ id: z.string(), title: z.string() })),
});
export type DraftPart = z.infer<typeof draftPartSchema>;

export const messagePartSchema = z.discriminatedUnion("type", [
  eventPartSchema,
  ticketCardPartSchema,
  ticketPickerPartSchema,
  draftPartSchema,
  quickRepliesPartSchema,
]);
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
