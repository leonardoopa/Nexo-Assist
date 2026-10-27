import { beforeEach, describe, expect, it } from "vitest";

import { openDatabase } from "@/server/db/open";

import { ConversationError, type ConversationErrorCode } from "./errors";
import { ConversationStore } from "./store";

const employee = (first: string, last: string) => ({
  email: `${first}.${last}@nexo.com.br`.toLowerCase(),
  name: `${first} ${last}`,
  department: null,
});
const ana = employee("Ana", "Souza");
const carla = employee("Carla", "Mendes");
const bruno = employee("Bruno", "Tavares");
const diego = employee("Diego", "Ramos");
const fabio = employee("Fabio", "Nunes");
const rafael = { email: "rafael.lima@nexo.com.br", name: "Rafael Lima" };
const marina = { email: "marina.alves@nexo.com.br", name: "Marina Alves" };

let clock: Date;
let counter: number;

function makeStore(messageLimit = 30): ConversationStore {
  return new ConversationStore(openDatabase(":memory:"), {
    messageLimit,
    now: () => clock,
    newId: () => `id-${++counter}`,
  });
}

function tick(minutes = 1) {
  clock = new Date(clock.getTime() + minutes * 60_000);
}

function codeOf(action: () => unknown): ConversationErrorCode {
  try {
    action();
  } catch (error) {
    if (error instanceof ConversationError) return error.code;
    throw error;
  }
  throw new Error("expected the call to fail");
}

function say(store: ConversationStore, id: string, role: "user" | "assistant", content: string) {
  tick();
  return store.appendMessage(id, { role, content });
}

beforeEach(() => {
  clock = new Date("2026-10-28T13:00:00Z");
  counter = 0;
});

describe("starting and resuming", () => {
  it("resumes the open conversation instead of starting another", () => {
    const store = makeStore();
    const first = store.resumeOrStart(ana);
    const again = store.resumeOrStart(ana);

    expect(first).toMatchObject({ created: true, conversation: { status: "agent", messageCount: 0 } });
    expect(again.created).toBe(false);
    expect(again.conversation.id).toBe(first.conversation.id);
  });

  it("refuses a second open conversation for the same employee", () => {
    const store = makeStore();
    store.start(ana);
    expect(codeOf(() => store.start(ana))).toBe("active_exists");
  });

  it("finds the latest conversation, open or closed", () => {
    const store = makeStore();
    const first = store.start(ana);
    store.close(first.id, "agent");
    expect(store.findLatest(ana.email)?.id).toBe(first.id);
    const second = store.start(ana);
    expect(store.findLatest(ana.email)?.id).toBe(second.id);
    expect(store.findLatest(carla.email)).toBeNull();
  });

  it("keeps one employee's conversation out of another's reach", () => {
    const store = makeStore();
    const { id } = store.start(ana);
    expect(store.getForEmployee(id, ana.email)?.id).toBe(id);
    expect(store.getForEmployee(id, carla.email)).toBeNull();
  });
});

describe("messages", () => {
  it("keeps order and tracks counters and preview", () => {
    const store = makeStore();
    const { id } = store.start(ana);
    say(store, id, "user", "Meu notebook não conecta na VPN.");
    say(store, id, "assistant", "Vou olhar   os seus\nchamados.");

    expect(store.messages(id).map((message) => [message.seq, message.role])).toEqual([
      [1, "user"],
      [2, "assistant"],
    ]);
    expect(store.get(id)).toMatchObject({
      messageCount: 2,
      lastMessage: { role: "assistant", preview: "Vou olhar os seus chamados." },
    });
  });

  it("stops the employee at the limit but still lets the assistant answer", () => {
    const store = makeStore(3);
    const { id } = store.start(ana);
    say(store, id, "user", "primeira");
    say(store, id, "assistant", "resposta");
    say(store, id, "user", "segunda");

    expect(codeOf(() => say(store, id, "user", "terceira"))).toBe("limit_reached");
    expect(() => say(store, id, "assistant", "responde à segunda")).not.toThrow();
    expect(store.get(id)?.messageCount).toBe(4);
  });

  it("does not count analyst or system messages", () => {
    const store = makeStore();
    const { id } = store.start(ana);
    store.handoff(id, { reason: "employee_request", group: "N2", summary: "Ana pediu um analista." });
    store.assume(id, rafael);
    tick();
    store.appendMessage(id, { role: "analyst", content: "Oi, Ana!", author: rafael });

    expect(store.get(id)?.messageCount).toBe(0);
  });
});

describe("handoff to an analyst", () => {
  function awaitingAnalyst() {
    const store = makeStore();
    const { id } = store.start(ana);
    say(store, id, "user", "Quero falar com um analista.");
    const handedOff = store.handoff(id, {
      reason: "employee_request",
      group: "N2",
      summary: "Ana pediu para falar com um analista sobre o INC-20311.",
      respondBy: "2026-10-28T15:05:00.000Z",
    });
    return { store, id, handedOff };
  }

  it("records why, to whom and by when, and leaves an event in the conversation", () => {
    const { store, id, handedOff } = awaitingAnalyst();

    expect(handedOff.status).toBe("awaiting_analyst");
    expect(handedOff.handoff).toMatchObject({ reason: "employee_request", group: "N2", respondBy: "2026-10-28T15:05:00.000Z" });
    const last = store.messages(id).at(-1);
    expect(last).toMatchObject({ role: "system", content: "Transferida para Suporte N2" });
    expect(last?.parts[0]).toMatchObject({ type: "event", kind: "handoff", data: { reason: "employee_request", group: "N2" } });
  });

  it("silences the assistant and counts what the employee writes while waiting", () => {
    const { store, id } = awaitingAnalyst();

    expect(codeOf(() => say(store, id, "assistant", "Posso ajudar?"))).toBe("agent_paused");
    say(store, id, "user", "Está parado há 5 dias.");
    expect(store.get(id)?.analystUnread).toBe(1);
  });

  it("lets only the analyst who took over speak, return or close", () => {
    const { store, id } = awaitingAnalyst();
    say(store, id, "user", "Alguém aí?");

    const taken = store.assume(id, rafael);
    expect(taken).toMatchObject({ status: "with_analyst", assignee: rafael, analystUnread: 0 });

    tick();
    expect(() => store.appendMessage(id, { role: "analyst", content: "Oi, Ana!", author: rafael })).not.toThrow();
    expect(codeOf(() => store.appendMessage(id, { role: "analyst", content: "Posso ajudar?", author: marina }))).toBe("not_assignee");
    expect(codeOf(() => store.returnToAgent(id, marina))).toBe("not_assignee");
    expect(codeOf(() => store.close(id, "analyst", marina))).toBe("not_assignee");
  });

  it("hands the conversation back to the assistant", () => {
    const { store, id } = awaitingAnalyst();
    store.assume(id, rafael);

    const back = store.returnToAgent(id, rafael);

    expect(back).toMatchObject({ status: "agent", handoff: null, assignee: null });
    expect(() => say(store, id, "assistant", "De volta por aqui.")).not.toThrow();
    const events = store.messages(id).flatMap((message) => message.parts.flatMap((part) => (part.type === "event" ? [part.kind] : [])));
    expect(events).toContain("returned_to_agent");
  });

  it("closes the conversation, and the next visit starts a fresh one", () => {
    const { store, id } = awaitingAnalyst();
    store.assume(id, rafael);

    const closed = store.close(id, "analyst", rafael);

    expect(closed).toMatchObject({ status: "closed", closedBy: "analyst" });
    expect(codeOf(() => say(store, id, "user", "mais uma coisa"))).toBe("closed");
    const next = store.resumeOrStart(ana);
    expect(next.created).toBe(true);
    expect(next.conversation.id).not.toBe(id);
  });

  it("lets the assistant close a conversation it resolved", () => {
    const store = makeStore();
    const { id } = store.start(ana);
    expect(store.close(id, "agent")).toMatchObject({ status: "closed", closedBy: "agent" });
  });

  it("refuses moves the life cycle does not allow", () => {
    const store = makeStore();
    const { id } = store.start(ana);

    expect(codeOf(() => store.assume(id, rafael))).toBe("invalid_transition");
    expect(codeOf(() => store.returnToAgent(id, rafael))).toBe("not_assignee");
    store.handoff(id, { reason: "overdue", group: "N1", summary: "Chamado vencido, sem resposta há dias." });
    expect(codeOf(() => store.handoff(id, { reason: "overdue", group: "N1", summary: "De novo, mesmo assunto." }))).toBe("invalid_transition");
    expect(codeOf(() => store.get("missing") ?? store.assume("missing", rafael))).toBe("not_found");
  });
});

describe("console listing", () => {
  function populated() {
    const store = makeStore();
    const waiting = store.start(ana).id;
    say(store, waiting, "user", "Está parado há 5 dias.");
    store.handoff(waiting, { reason: "overdue", group: "N2", summary: "Chamado vencido há 5 dias." });

    const attending = store.start(carla).id;
    say(store, attending, "user", "Preciso de acesso ao SAP.");

    const mine = store.start(bruno).id;
    store.handoff(mine, { reason: "low_confidence", group: "N2", summary: "O agent não teve segurança." });
    store.assume(mine, rafael);

    const finished = store.start(fabio).id;
    say(store, finished, "user", "Isso resolveu, obrigado!");
    store.close(finished, "agent");

    const quiet = store.start(diego).id;
    say(store, quiet, "user", "Oi");
    return { store, waiting, attending, mine, finished, quiet };
  }

  it("filters by tab and orders people-needed conversations first", () => {
    const { store, waiting, attending, mine, finished, quiet } = populated();
    const ids = (tab: "all" | "for_you" | "agent" | "mine", analystEmail = rafael.email) =>
      store.listForConsole({ tab, analystEmail }).map((conversation) => conversation.id);

    expect(ids("for_you")).toEqual([waiting]);
    expect(ids("agent")).toEqual([quiet, attending]);
    expect(ids("mine")).toEqual([mine]);
    expect(ids("mine", marina.email)).toEqual([]);
    expect(ids("all")).toEqual([waiting, mine, quiet, attending, finished]);
  });

  it("searches by name or e-mail", () => {
    const { store, waiting } = populated();
    const found = store.listForConsole({ tab: "all", analystEmail: rafael.email, search: "souza" });
    expect(found.map((conversation) => conversation.id)).toEqual([waiting]);
    expect(store.listForConsole({ tab: "all", analystEmail: rafael.email, search: "%" })).toEqual([]);
  });

  it("counts every tab for the analyst asking", () => {
    const { store } = populated();
    expect(store.consoleCounts(rafael.email)).toEqual({ for_you: 1, agent: 2, mine: 1, all: 5 });
    expect(store.consoleCounts(marina.email).mine).toBe(0);
  });

  it("drops closed conversations from the full list after a week", () => {
    const { store, finished } = populated();
    clock = new Date(clock.getTime() + 8 * 24 * 60 * 60 * 1000);
    const everything = store.listForConsole({ tab: "all", analystEmail: rafael.email });
    expect(everything.map((conversation) => conversation.id)).not.toContain(finished);
  });
});
