import type { DecisionStore } from "@/server/agent/decision-store";
import { toConversationView, toMessageView } from "@/server/chat/view";
import type { ConversationStore } from "@/server/conversations/store";
import type { AnalystRef, ConsoleTab, Conversation, TicketRelation } from "@/server/conversations/types";
import { ServiceDeskError } from "@/server/servicedesk/errors";
import type { ServiceDeskPort } from "@/server/servicedesk/port";

import type { ConsoleDetail, ConsoleItem, ConsoleList, ConsoleTickets } from "./view";

export interface ConsoleDeps {
  conversations: ConversationStore;
  decisions: DecisionStore;
  serviceDesk: ServiceDeskPort;
}

/** Which ticket a conversation "is about": what it transferred or created beats what it merely looked at. */
const RELATION_ORDER: readonly TicketRelation[] = ["transferred", "created", "reopened", "updated", "consulted"];

function mainTicketId(links: ReadonlyArray<{ ticketId: string; relation: TicketRelation }>): string | null {
  for (const relation of RELATION_ORDER) {
    const found = [...links].reverse().find((link) => link.relation === relation);
    if (found) return found.ticketId;
  }
  return null;
}

function toItem(deps: ConsoleDeps, conversation: Conversation): ConsoleItem {
  const { handoff } = conversation;
  return {
    id: conversation.id,
    employee: { name: conversation.employee.name, email: conversation.employee.email, department: conversation.employee.department },
    status: conversation.status,
    handoff: handoff ? { reason: handoff.reason, group: handoff.group, respondBy: handoff.respondBy } : null,
    assignee: conversation.assignee,
    closedBy: conversation.closedBy,
    analystUnread: conversation.analystUnread,
    lastMessage: conversation.lastMessage,
    updatedAt: conversation.updatedAt,
    ticketId: mainTicketId(deps.conversations.linkedTickets(conversation.id)),
    agentConfidence: handoff?.reason === "low_confidence" ? (deps.decisions.latest(conversation.id)?.confidence.score ?? null) : null,
  };
}

export function listConsole(deps: ConsoleDeps, analyst: AnalystRef, query: { tab: ConsoleTab; search?: string }): ConsoleList {
  const rows = deps.conversations.listForConsole({ tab: query.tab, analystEmail: analyst.email, search: query.search, limit: 50 });
  return { items: rows.map((row) => toItem(deps, row)), counts: deps.conversations.consoleCounts(analyst.email) };
}

async function employeeTickets(deps: ConsoleDeps, analyst: AnalystRef, employeeEmail: string): Promise<ConsoleTickets> {
  try {
    const list = await deps.serviceDesk.listTickets(analyst.email, { requester: employeeEmail, status: "all", limit: 50 });
    return {
      state: "ok",
      items: list.items.map((ticket) => ({
        id: ticket.id,
        type: ticket.type,
        title: ticket.title,
        category: ticket.category,
        subcategory: ticket.subcategory,
        priority: ticket.priority,
        status: ticket.status,
        overdue: ticket.sla.overdue,
        createdAt: ticket.createdAt,
        lastResponseAt: ticket.lastResponseAt,
        resolvedAt: ticket.resolvedAt,
        assignedGroup: ticket.assignedGroup,
        assignee: ticket.assignee?.name ?? null,
      })),
    };
  } catch (error) {
    if (error instanceof ServiceDeskError) return { state: "unavailable" };
    throw error;
  }
}

/** One conversation with everything the analyst sees: messages, the decisions behind the agent's answers, and the employee's tickets. */
export async function loadConsoleDetail(deps: ConsoleDeps, analyst: AnalystRef, conversationId: string): Promise<ConsoleDetail | null> {
  const conversation = deps.conversations.get(conversationId);
  if (!conversation) return null;
  const explained = deps.decisions.forConversation(conversation.id);

  return {
    conversation: {
      ...toConversationView(conversation, deps.conversations.messageLimit),
      employee: conversation.employee,
      assigneeEmail: conversation.assignee?.email ?? null,
      closedBy: conversation.closedBy,
    },
    messages: deps.conversations.messages(conversation.id).map((message) => toMessageView(message, explained.get(message.id) ?? null)),
    links: deps.conversations.linkedTickets(conversation.id),
    tickets: await employeeTickets(deps, analyst, conversation.employee.email),
  };
}
