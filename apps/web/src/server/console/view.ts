import type { SupportGroup } from "@/lib/domain";
import type { ConversationView, MessageView } from "@/server/chat/view";
import type {
  ClosedBy,
  ConsoleTab,
  ConversationStatus,
  EmployeeRef,
  HandoffReason,
  TicketRelation,
} from "@/server/conversations/types";
import type { Category, Priority, TicketStatus, TicketType } from "@/server/servicedesk/schemas";

/** One row of the console list. */
export interface ConsoleItem {
  id: string;
  employee: { name: string; email: string; department: string | null };
  status: ConversationStatus;
  handoff: { reason: HandoffReason; group: SupportGroup; respondBy: string | null } | null;
  assignee: { email: string; name: string } | null;
  closedBy: ClosedBy | null;
  analystUnread: number;
  lastMessage: { at: string; preview: string; role: "user" | "assistant" | "analyst" } | null;
  updatedAt: string;
  /** The ticket this conversation is about, if any. */
  ticketId: string | null;
  /** How sure the agent was in its last answer; shown when it handed over because it was unsure. */
  agentConfidence: number | null;
}

export interface ConsoleList {
  items: ConsoleItem[];
  counts: Record<ConsoleTab, number>;
}

/** A ticket of the employee, as the analyst's side panel lists it. */
export interface ConsoleTicket {
  id: string;
  type: TicketType;
  title: string;
  category: Category;
  subcategory: string | null;
  priority: Priority;
  status: TicketStatus;
  overdue: boolean;
  createdAt: string;
  lastResponseAt: string;
  resolvedAt: string | null;
  assignedGroup: SupportGroup | null;
}

/** The service desk is the unstable legacy system: the panel says so instead of failing the whole screen. */
export type ConsoleTickets = { state: "ok"; items: ConsoleTicket[] } | { state: "unavailable" };

export interface ConsoleConversation extends ConversationView {
  employee: EmployeeRef;
  assigneeEmail: string | null;
  closedBy: ClosedBy | null;
}

export interface ConsoleDetail {
  conversation: ConsoleConversation;
  messages: MessageView[];
  links: Array<{ ticketId: string; relation: TicketRelation; at: string }>;
  tickets: ConsoleTickets;
}
