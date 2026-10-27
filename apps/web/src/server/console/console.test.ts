import { describe, expect, it } from "vitest";

import type { DecisionRecord } from "@/server/agent/decision";
import { DecisionStore } from "@/server/agent/decision-store";
import { ConversationError, type ConversationErrorCode } from "@/server/conversations/errors";
import { ConversationStore } from "@/server/conversations/store";
import type { EmployeeRef, HandoffReason } from "@/server/conversations/types";
import { openDatabase } from "@/server/db/open";
import { ServiceDeskUnavailableError } from "@/server/servicedesk/errors";
import { FakeServiceDesk } from "@/test/fake-service-desk";
import { ANA, CARLA, MARINA, NOW, RAFAEL } from "@/test/fixtures";

import { consoleActionSchema, describeConsoleError, runConsoleAction } from "./actions";
import { listConsole, loadConsoleDetail, type ConsoleDeps } from "./load";

const rafael = { email: RAFAEL.email, name: RAFAEL.name };
const marina = { email: MARINA.email, name: MARINA.name };
const ana: EmployeeRef = { email: ANA.email, name: ANA.name, department: ANA.department };
const carla: EmployeeRef = { email: CARLA.email, name: CARLA.name, department: CARLA.department };

function setup() {
  const db = openDatabase(":memory:");
  let counter = 0;
  const newId = () => `id-${++counter}`;
  const serviceDesk = new FakeServiceDesk();
  const conversations = new ConversationStore(db, { messageLimit: 30, now: () => NOW, newId });
  const decisions = new DecisionStore(db, () => NOW);
  const deps: ConsoleDeps = { conversations, decisions, serviceDesk };
  return { deps, conversations, decisions, serviceDesk };
}

type Setup = ReturnType<typeof setup>;

const decisionWith = (score: number): DecisionRecord => ({
  version: 1,
  intent: "handoff",
  understanding: "O funcionário quer falar com uma pessoa.",
  action: "Transferiu a conversa.",
  rationale: "Pedido explícito.",
  confidence: { score, level: score >= 0.75 ? "alta" : score >= 0.5 ? "media" : "baixa", factors: [] },
  rules: [],
  steps: [],
  guardrails: [],
  handoff: null,
  usage: null,
});

/** A conversation the agent handed over, with the ticket it transferred linked to it. */
function handedOver(
  { conversations, decisions }: Setup,
  employee: EmployeeRef,
  options: { ticketId?: string; reason?: HandoffReason; score?: number } = {},
): string {
  const { id } = conversations.start(employee);
  conversations.appendMessage(id, { role: "user", content: "Meu chamado venceu e ninguém respondeu." });
  const { message } = conversations.appendMessage(id, { role: "assistant", content: "Vou chamar um analista." });
  decisions.save({ id: `decision-${id}`, conversationId: id, messageId: message.id, decision: decisionWith(options.score ?? 0.9) });
  if (options.ticketId) conversations.linkTicket(id, options.ticketId, "transferred");
  conversations.handoff(id, { reason: options.reason ?? "overdue", group: "N2", summary: "Chamado vencido, o funcionário aguarda." });
  return id;
}

function codeOf(error: unknown): ConversationErrorCode {
  expect(error).toBeInstanceOf(ConversationError);
  return (error as ConversationError).code;
}

async function failureOf(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to fail");
}

describe("listConsole", () => {
  it("counts every tab and lists only the one asked for", () => {
    const s = setup();
    handedOver(s, ana);
    const { id } = s.conversations.start(carla);
    s.conversations.appendMessage(id, { role: "user", content: "Oi" });

    const list = listConsole(s.deps, rafael, { tab: "for_you" });

    expect(list.items.map((item) => item.employee.name)).toEqual(["Ana Souza"]);
    expect(list.counts).toEqual({ for_you: 1, agent: 1, mine: 0, all: 2 });
  });

  it("points each conversation at the ticket it is about, preferring what was transferred", () => {
    const s = setup();
    const id = handedOver(s, ana, { ticketId: "INC-20311" });
    s.conversations.linkTicket(id, "INC-20298", "consulted");

    expect(listConsole(s.deps, rafael, { tab: "all" }).items[0]?.ticketId).toBe("INC-20311");
  });

  it("has no ticket to point at when the conversation never touched one", () => {
    const s = setup();
    handedOver(s, ana);

    expect(listConsole(s.deps, rafael, { tab: "all" }).items[0]?.ticketId).toBeNull();
  });

  it("shows how unsure the agent was only when that is why it handed over", () => {
    const s = setup();
    handedOver(s, ana, { reason: "low_confidence", score: 0.42 });
    handedOver(s, carla, { reason: "overdue", score: 0.9 });

    const byName = Object.fromEntries(listConsole(s.deps, rafael, { tab: "all" }).items.map((item) => [item.employee.name, item.agentConfidence]));

    expect(byName).toEqual({ "Ana Souza": 0.42, "Carla Mendes": null });
  });

  it("finds a conversation by ticket number or by who wrote", () => {
    const s = setup();
    handedOver(s, ana, { ticketId: "INC-20311" });
    handedOver(s, carla);

    const names = (search: string) => listConsole(s.deps, rafael, { tab: "all", search }).items.map((item) => item.employee.name);

    expect(names("20311")).toEqual(["Ana Souza"]);
    expect(names("carla")).toEqual(["Carla Mendes"]);
    expect(names("nobody")).toEqual([]);
  });
});

describe("loadConsoleDetail", () => {
  it("returns nothing for a conversation that does not exist", async () => {
    const s = setup();

    expect(await loadConsoleDetail(s.deps, rafael, "missing")).toBeNull();
  });

  it("gathers the messages with the agent's decisions, the links and the employee's own tickets", async () => {
    const s = setup();
    const id = handedOver(s, ana, { ticketId: "INC-20311", score: 0.9 });

    const detail = await loadConsoleDetail(s.deps, rafael, id);

    expect(detail?.conversation).toMatchObject({ id, status: "awaiting_analyst", employee: { email: ANA.email }, assigneeEmail: null });
    const assistant = detail?.messages.find((message) => message.role === "assistant");
    expect(assistant?.decision?.confidence.score).toBe(0.9);
    expect(detail?.links).toEqual([expect.objectContaining({ ticketId: "INC-20311", relation: "transferred" })]);
    expect(detail?.tickets.state).toBe("ok");
    if (detail?.tickets.state !== "ok") return;
    expect(detail.tickets.items.map((ticket) => ticket.id).sort()).toEqual(["INC-19877", "INC-20298", "INC-20311", "REQ-10442"]);
    expect(detail.tickets.items.find((ticket) => ticket.id === "INC-20311")).toMatchObject({ overdue: true, assignedGroup: "N2" });
    expect(s.serviceDesk.callsOf("listTickets")[0]?.args).toEqual([RAFAEL.email, { requester: ANA.email, status: "all", limit: 50 }]);
  });

  it("says the ticket system is unavailable instead of failing the whole screen", async () => {
    const s = setup();
    const id = handedOver(s, ana);
    s.serviceDesk.failNext("listTickets", new ServiceDeskUnavailableError("fora do ar", "legacy_unavailable", 503));

    const detail = await loadConsoleDetail(s.deps, rafael, id);

    expect(detail?.tickets).toEqual({ state: "unavailable" });
    expect(detail?.messages.length).toBeGreaterThan(0);
  });

  it("does not hide a bug behind the unavailable notice", async () => {
    const s = setup();
    const id = handedOver(s, ana);
    s.serviceDesk.failNext("listTickets", new TypeError("bug"));

    await expect(loadConsoleDetail(s.deps, rafael, id)).rejects.toThrowError("bug");
  });
});

describe("runConsoleAction: assume", () => {
  it("pauses the agent and puts the analyst on the ticket that was handed over", async () => {
    const s = setup();
    const id = handedOver(s, ana, { ticketId: "INC-20311" });

    const { notice } = await runConsoleAction(s.deps, rafael, id, { type: "assume" });

    expect(notice).toBeNull();
    expect(s.conversations.get(id)).toMatchObject({ status: "with_analyst", assignee: rafael });
    expect(s.serviceDesk.callsOf("assumeTicket")).toHaveLength(1);
    expect(s.serviceDesk.callsOf("assumeTicket")[0]?.args).toEqual([RAFAEL.email, "INC-20311", `assume-${id}-INC-20311`]);
    expect(s.serviceDesk.tickets.find((ticket) => ticket.id === "INC-20311")).toMatchObject({
      status: "em_atendimento",
      assignee: { email: RAFAEL.email },
    });
  });

  it("leaves tickets the conversation only looked at alone", async () => {
    const s = setup();
    const id = handedOver(s, ana);
    s.conversations.linkTicket(id, "INC-20298", "consulted");

    await runConsoleAction(s.deps, rafael, id, { type: "assume" });

    expect(s.serviceDesk.callsOf("assumeTicket")).toEqual([]);
  });

  it("keeps the conversation and warns when the ticket system fails", async () => {
    const s = setup();
    const id = handedOver(s, ana, { ticketId: "INC-20311" });
    s.serviceDesk.failNext("assumeTicket", new ServiceDeskUnavailableError("fora do ar", "legacy_unavailable", 503));

    const { notice } = await runConsoleAction(s.deps, rafael, id, { type: "assume" });

    expect(s.conversations.get(id)?.status).toBe("with_analyst");
    expect(notice).toContain("INC-20311");
  });

  it("lets only one analyst win when two take the same conversation", async () => {
    const s = setup();
    const id = handedOver(s, ana, { ticketId: "INC-20311" });
    await runConsoleAction(s.deps, rafael, id, { type: "assume" });

    const error = await failureOf(runConsoleAction(s.deps, marina, id, { type: "assume" }));

    expect(codeOf(error)).toBe("invalid_transition");
    expect(s.conversations.get(id)?.assignee).toEqual(rafael);
    expect(s.serviceDesk.callsOf("assumeTicket")).toHaveLength(1);
  });

  it("refuses a conversation the agent still holds", async () => {
    const s = setup();
    const { id } = s.conversations.start(ana);

    expect(codeOf(await failureOf(runConsoleAction(s.deps, rafael, id, { type: "assume" })))).toBe("invalid_transition");
  });
});

describe("runConsoleAction: answering, returning and closing", () => {
  async function assumed(s: Setup) {
    const id = handedOver(s, ana, { ticketId: "INC-20311" });
    await runConsoleAction(s.deps, rafael, id, { type: "assume" });
    return id;
  }

  it("delivers the analyst's answer and counts what the employee wrote as read", async () => {
    const s = setup();
    const id = await assumed(s);
    s.conversations.appendMessage(id, { role: "user", content: "Alguma novidade?" });
    expect(s.conversations.get(id)?.analystUnread).toBe(1);

    await runConsoleAction(s.deps, rafael, id, { type: "message", content: "Estou verificando agora." });

    const last = s.conversations.messages(id).at(-1);
    expect(last).toMatchObject({ role: "analyst", content: "Estou verificando agora.", author: rafael });
    expect(s.conversations.get(id)?.analystUnread).toBe(0);
  });

  it("only lets whoever took the conversation answer, return or close it", async () => {
    const s = setup();
    const id = await assumed(s);

    for (const action of [{ type: "message", content: "Oi" }, { type: "return" }, { type: "close" }] as const) {
      expect(codeOf(await failureOf(runConsoleAction(s.deps, marina, id, action)))).toBe("not_assignee");
    }
    expect(s.conversations.get(id)).toMatchObject({ status: "with_analyst", assignee: rafael });
  });

  it("gives the conversation back to the agent without the old hand-over", async () => {
    const s = setup();
    const id = await assumed(s);

    await runConsoleAction(s.deps, rafael, id, { type: "return" });

    expect(s.conversations.get(id)).toMatchObject({ status: "agent", assignee: null, handoff: null, analystUnread: 0 });
    expect(() => s.conversations.appendMessage(id, { role: "assistant", content: "Voltei." })).not.toThrow();
  });

  it("closes the conversation for good", async () => {
    const s = setup();
    const id = await assumed(s);

    await runConsoleAction(s.deps, rafael, id, { type: "close" });

    expect(s.conversations.get(id)).toMatchObject({ status: "closed", closedBy: "analyst" });
    expect(codeOf(await failureOf(runConsoleAction(s.deps, rafael, id, { type: "message", content: "Ainda aí?" })))).toBe("closed");
  });

  it("marks a conversation as read without taking it", async () => {
    const s = setup();
    const id = handedOver(s, ana);
    s.conversations.appendMessage(id, { role: "user", content: "Alguém aí?" });
    expect(s.conversations.get(id)?.analystUnread).toBe(1);

    await runConsoleAction(s.deps, rafael, id, { type: "read" });

    expect(s.conversations.get(id)).toMatchObject({ status: "awaiting_analyst", analystUnread: 0 });
  });
});

describe("consoleActionSchema", () => {
  it("accepts each action", () => {
    for (const action of [{ type: "assume" }, { type: "return" }, { type: "close" }, { type: "read" }, { type: "message", content: "Oi" }]) {
      expect(consoleActionSchema.safeParse(action).success).toBe(true);
    }
  });

  it("trims the answer and refuses a blank or oversized one", () => {
    expect(consoleActionSchema.parse({ type: "message", content: "  Oi  " })).toEqual({ type: "message", content: "Oi" });
    expect(consoleActionSchema.safeParse({ type: "message", content: "   " }).success).toBe(false);
    expect(consoleActionSchema.safeParse({ type: "message", content: "a".repeat(2001) }).success).toBe(false);
    expect(consoleActionSchema.safeParse({ type: "message" }).success).toBe(false);
  });

  it("refuses an action it does not know", () => {
    expect(consoleActionSchema.safeParse({ type: "delete" }).success).toBe(false);
  });
});

describe("describeConsoleError", () => {
  it("maps what the conversation refused to an HTTP status", () => {
    const status = (code: ConversationErrorCode) => describeConsoleError(new ConversationError(code, "x"), { type: "read" }).status;

    expect(status("not_found")).toBe(404);
    expect(status("not_assignee")).toBe(403);
    expect(status("closed")).toBe(409);
  });

  it("explains a lost race in words an analyst understands", () => {
    const error = new ConversationError("invalid_transition", 'Não dá para aplicar "assume" a uma conversa em "with_analyst".');

    expect(describeConsoleError(error, { type: "assume" }).message).toMatch(/outro analista/);
    expect(describeConsoleError(error, { type: "close" }).message).toMatch(/Atualize a tela/);
  });

  it("keeps the store's own message when it is already clear", () => {
    const error = new ConversationError("not_assignee", "Só o analista que assumiu a conversa pode fazer isso.");

    expect(describeConsoleError(error, { type: "return" })).toEqual({ status: 403, code: "not_assignee", message: error.message });
  });
});
