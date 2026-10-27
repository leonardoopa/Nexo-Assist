import { describe, expect, it } from "vitest";

import { DecisionStore } from "@/server/agent/decision-store";
import { listConsole, type ConsoleDeps } from "@/server/console/load";
import { ConversationStore } from "@/server/conversations/store";
import { openDatabase } from "@/server/db/open";
import { FakeServiceDesk } from "@/test/fake-service-desk";
import { ANA, NOW, RAFAEL } from "@/test/fixtures";

import { seedDemoConversations } from "./seed";

const rafael = { email: RAFAEL.email, name: RAFAEL.name };

function setup() {
  const db = openDatabase(":memory:");
  const conversations = new ConversationStore(db, { messageLimit: 30, now: () => NOW });
  const decisions = new DecisionStore(db, () => NOW);
  const deps: ConsoleDeps = { conversations, decisions, serviceDesk: new FakeServiceDesk() };
  const seed = () => seedDemoConversations(db, { now: NOW, messageLimit: 30 });
  const names = (tab: "all" | "for_you" | "agent" | "mine") => listConsole(deps, rafael, { tab }).items.map((item) => item.employee.name).sort();
  return { db, conversations, decisions, deps, seed, names };
}

describe("seedDemoConversations", () => {
  it("fills an empty database so every tab of the console has something in it", () => {
    const s = setup();

    expect(s.seed()).toBe(true);

    expect(listConsole(s.deps, rafael, { tab: "all" }).counts).toEqual({ for_you: 2, agent: 2, mine: 1, all: 6 });
    expect(s.names("for_you")).toEqual(["Bruno Tavares", "Carla Mendes"]);
    expect(s.names("mine")).toEqual(["Fábio Nunes"]);
    expect(s.names("agent")).toEqual(["Diego Ramos", "Elisa Prado"]);
  });

  it("never touches a database that already has conversations", () => {
    const s = setup();
    s.conversations.start({ email: ANA.email, name: ANA.name, department: ANA.department });

    expect(s.seed()).toBe(false);
    expect(listConsole(s.deps, rafael, { tab: "all" }).counts.all).toBe(1);
  });

  it("does nothing the second time, so restarting the app keeps what people did", () => {
    const s = setup();
    s.seed();

    expect(s.seed()).toBe(false);
    expect(listConsole(s.deps, rafael, { tab: "all" }).counts.all).toBe(6);
  });

  it("leaves Ana without a conversation, so the employee chat can be tried from a clean start", () => {
    const s = setup();
    s.seed();

    expect(s.conversations.findLatest(ANA.email)).toBeNull();
  });

  it("explains every answer of the agent with a decision record", () => {
    const s = setup();
    s.seed();

    for (const item of listConsole(s.deps, rafael, { tab: "all" }).items) {
      const assistant = s.conversations.messages(item.id).filter((message) => message.role === "assistant");
      const explained = s.decisions.forConversation(item.id);
      expect(assistant.length).toBeGreaterThan(0);
      expect(assistant.every((message) => explained.has(message.id))).toBe(true);
    }
  });

  it("does not claim a model wrote what a script wrote", () => {
    const s = setup();
    s.seed();

    const records = listConsole(s.deps, rafael, { tab: "all" }).items.flatMap((item) => [...s.decisions.forConversation(item.id).values()]);

    expect(records.length).toBeGreaterThan(0);
    expect(records.every((record) => record.usage === null)).toBe(true);
  });

  it("shows the unsure hand-over with the agent's real confidence and the others without one", () => {
    const s = setup();
    s.seed();

    const items = listConsole(s.deps, rafael, { tab: "for_you" }).items;
    const confidence = Object.fromEntries(items.map((item) => [item.employee.name, item.agentConfidence]));

    expect(confidence).toEqual({ "Carla Mendes": 0.45, "Bruno Tavares": null });
    expect(items.every((item) => item.analystUnread === 1)).toBe(true);
  });

  it("has Rafael already answering one conversation, with nothing unread", () => {
    const s = setup();
    s.seed();

    const [mine] = listConsole(s.deps, rafael, { tab: "mine" }).items;
    const roles = s.conversations.messages(mine!.id).map((message) => message.role);

    expect(mine).toMatchObject({ status: "with_analyst", assignee: rafael, analystUnread: 0 });
    expect(roles.filter((role) => role === "analyst")).toHaveLength(2);
  });

  it("closes one conversation by the agent and lets that employee start another", () => {
    const s = setup();
    s.seed();

    const closed = listConsole(s.deps, rafael, { tab: "all" }).items.find((item) => item.status === "closed");

    expect(closed).toMatchObject({ employee: { name: "Gabriela Rocha" }, closedBy: "agent" });
    expect(s.conversations.resumeOrStart({ email: closed!.employee.email, name: "Gabriela Rocha", department: null }).created).toBe(true);
  });

  it("tells each story in order and in the past", () => {
    const s = setup();
    s.seed();

    for (const item of listConsole(s.deps, rafael, { tab: "all" }).items) {
      const stamps = s.conversations.messages(item.id).map((message) => message.createdAt);
      expect(stamps).toEqual([...stamps].sort());
      expect(stamps.every((stamp) => stamp <= NOW.toISOString())).toBe(true);
    }
  });

  it("links each conversation to the tickets the service desk really has for that person", () => {
    const s = setup();
    s.seed();

    const tickets = Object.fromEntries(listConsole(s.deps, rafael, { tab: "all" }).items.map((item) => [item.employee.name, item.ticketId]));

    expect(tickets).toEqual({
      "Bruno Tavares": "INC-20402",
      "Carla Mendes": "INC-20150",
      "Diego Ramos": "REQ-10430",
      "Elisa Prado": "INC-20519",
      "Fábio Nunes": "INC-20480",
      "Gabriela Rocha": null,
    });
  });
});
