import { describe, expect, it } from "vitest";

import type { MessageView } from "@/server/chat/view";
import type { ConsoleItem, ConsoleTicket, ConsoleTickets } from "@/server/console/view";

import { groupByDay, itemStatus, previewOf, ticketsOverview } from "./view-model";

const now = new Date("2026-10-28T13:00:00Z");
const me = "rafael.lima@nexo.com.br";

const item = (overrides: Partial<ConsoleItem> = {}): ConsoleItem => ({
  id: "c1",
  employee: { name: "Ana Souza", email: "ana.souza@nexo.com.br", department: "Financeiro" },
  status: "agent",
  handoff: null,
  assignee: null,
  closedBy: null,
  analystUnread: 0,
  lastMessage: { at: "2026-10-28T12:00:00Z", preview: "Oi", role: "user" },
  updatedAt: "2026-10-28T12:00:00Z",
  ticketId: null,
  agentConfidence: null,
  ...overrides,
});

const handoff = (overrides: Partial<NonNullable<ConsoleItem["handoff"]>> = {}) => ({
  reason: "employee_request" as const,
  group: "N2" as const,
  respondBy: null,
  ...overrides,
});

describe("itemStatus", () => {
  it("shows a hand-over with its ticket and deadline", () => {
    const status = itemStatus(
      item({ status: "awaiting_analyst", ticketId: "INC-20311", handoff: handoff({ respondBy: "2026-10-28T20:42:00Z" }) }),
      me,
      now,
    );

    expect(status).toEqual({ text: "Transferida · INC-20311 · resposta até 17:42", tone: "warning" });
  });

  it("turns red when the deadline to answer has passed", () => {
    const status = itemStatus(item({ status: "awaiting_analyst", handoff: handoff({ respondBy: "2026-10-28T12:00:00Z" }) }), me, now);

    expect(status).toEqual({ text: "Transferida · resposta atrasada", tone: "danger" });
  });

  it("says the agent asked for help, and how sure it was", () => {
    const status = itemStatus(
      item({ status: "awaiting_analyst", handoff: handoff({ reason: "low_confidence" }), agentConfidence: 0.41 }),
      me,
      now,
    );

    expect(status).toEqual({ text: "Agent pediu ajuda · confiança 41%", tone: "warning" });
  });

  it("tells your conversations from other analysts'", () => {
    const rafael = { email: me, name: "Rafael Lima" };
    const marina = { email: "marina.alves@nexo.com.br", name: "Marina Alves" };

    expect(itemStatus(item({ status: "with_analyst", assignee: rafael }), me, now)).toEqual({ text: "Você está atendendo", tone: "info" });
    expect(itemStatus(item({ status: "with_analyst", assignee: marina }), me, now)).toEqual({ text: "Atendendo: Marina Alves", tone: "neutral" });
  });

  it("says who is answering when it is the agent, with the ticket when there is one", () => {
    expect(itemStatus(item(), me, now).text).toBe("Agent atendendo");
    expect(itemStatus(item({ ticketId: "REQ-10430" }), me, now).text).toBe("Agent atendendo · REQ-10430");
  });

  it("tells who closed a finished conversation", () => {
    expect(itemStatus(item({ status: "closed", closedBy: "agent" }), me, now)).toEqual({ text: "Resolvida pelo agent", tone: "success" });
    expect(itemStatus(item({ status: "closed", closedBy: "analyst", assignee: { email: me, name: "Rafael Lima" } }), me, now).text).toBe(
      "Encerrada por Rafael Lima",
    );
  });
});

describe("previewOf", () => {
  it("names who wrote the last message unless it was the employee", () => {
    const rafael = { email: me, name: "Rafael Lima" };
    const last = (role: "user" | "assistant" | "analyst") => item({ lastMessage: { at: "2026-10-28T12:00:00Z", preview: "Oi", role }, assignee: rafael });

    expect(previewOf(last("user"), me)).toBe("Oi");
    expect(previewOf(last("assistant"), me)).toBe("Agent: Oi");
    expect(previewOf(last("analyst"), me)).toBe("Você: Oi");
    expect(previewOf(last("analyst"), "marina.alves@nexo.com.br")).toBe("Analista: Oi");
  });

  it("copes with a conversation that has no messages yet", () => {
    expect(previewOf(item({ lastMessage: null }), me)).toBe("Sem mensagens");
  });
});

const ticket = (overrides: Partial<ConsoleTicket> & Pick<ConsoleTicket, "id">): ConsoleTicket => ({
  type: "INC",
  title: `Chamado ${overrides.id}`,
  category: "hardware",
  subcategory: null,
  priority: "media",
  status: "aberto",
  overdue: false,
  createdAt: "2026-10-20T12:00:00Z",
  lastResponseAt: "2026-10-21T12:00:00Z",
  resolvedAt: null,
  assignedGroup: null,
  assignee: null,
  ...overrides,
});

const ok = (items: ConsoleTicket[]): ConsoleTickets => ({ state: "ok", items });

describe("ticketsOverview", () => {
  it("separates the tickets of the conversation from the others and counts open and closed ones", () => {
    const overview = ticketsOverview(
      [{ ticketId: "INC-2", relation: "transferred", at: "2026-10-28T12:00:00Z" }],
      ok([
        ticket({ id: "INC-1", status: "resolvido", resolvedAt: "2026-09-02T12:00:00Z" }),
        ticket({ id: "INC-2" }),
        ticket({ id: "INC-3" }),
        ticket({ id: "INC-4", status: "resolvido", resolvedAt: "2026-10-01T12:00:00Z" }),
      ]),
    );

    expect(overview.fromConversation.map((row) => row.id)).toEqual(["INC-2"]);
    expect(overview.others.map((row) => row.id)).toEqual(["INC-3", "INC-4", "INC-1"]);
    expect({ open: overview.open, closed: overview.closed }).toEqual({ open: 2, closed: 2 });
  });

  it("describes a ticket by the strongest thing the conversation did to it", () => {
    const overview = ticketsOverview(
      [
        { ticketId: "INC-2", relation: "consulted", at: "2026-10-28T10:00:00Z" },
        { ticketId: "INC-2", relation: "transferred", at: "2026-10-28T10:05:00Z" },
        { ticketId: "INC-5", relation: "consulted", at: "2026-10-28T10:01:00Z" },
      ],
      ok([ticket({ id: "INC-2" }), ticket({ id: "INC-5" })]),
    );

    expect(overview.fromConversation.map((row) => [row.id, row.relation])).toEqual([
      ["INC-2", "transferred"],
      ["INC-5", "consulted"],
    ]);
    expect(overview.fromConversation[0]?.at).toBe("2026-10-28T10:05:00Z");
  });

  it("keeps the links visible when the ticket system cannot be read", () => {
    const overview = ticketsOverview([{ ticketId: "INC-2", relation: "created", at: "2026-10-28T10:00:00Z" }], { state: "unavailable" });

    expect(overview.fromConversation).toEqual([{ id: "INC-2", ticket: null, relation: "created", at: "2026-10-28T10:00:00Z" }]);
    expect(overview.others).toEqual([]);
    expect({ open: overview.open, closed: overview.closed }).toEqual({ open: 0, closed: 0 });
  });
});

describe("groupByDay", () => {
  const message = (id: string, createdAt: string): MessageView => ({
    id,
    seq: 1,
    role: "user",
    authorName: null,
    content: id,
    parts: [],
    createdAt,
    decision: null,
  });

  it("starts a new group at each calendar day of the company's timezone", () => {
    const groups = groupByDay(
      [
        message("a", "2026-10-27T15:00:00Z"),
        message("b", "2026-10-28T02:30:00Z"), // still the 27th in Sao Paulo
        message("c", "2026-10-28T12:00:00Z"),
        message("d", "2026-10-28T12:30:00Z"),
      ],
      now,
    );

    expect(groups.map((group) => [group.label, group.messages.map((entry) => entry.id)])).toEqual([
      ["Ontem", ["a", "b"]],
      ["Hoje", ["c", "d"]],
    ]);
  });

  it("returns nothing for an empty conversation", () => {
    expect(groupByDay([], now)).toEqual([]);
  });
});
