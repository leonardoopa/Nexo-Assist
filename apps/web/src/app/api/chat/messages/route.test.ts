import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getAgentRuntime } from "@/server/agent";
import { decodeEvents, type TurnEvent } from "@/server/chat/events";
import { signSession, type Session } from "@/server/session";
import { createHarness } from "@/test/agent-harness";
import { ANA, CARLA } from "@/test/fixtures";
import { call, replyCall } from "@/test/scripted-model";

import { POST as startConversation } from "../conversations/route";
import { GET as loadChat } from "../route";
import { POST } from "./route";

vi.mock("@/server/agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/agent")>()),
  getAgentRuntime: vi.fn(),
}));

const secret = "t".repeat(32);
const employee = (person: { email: string; name: string }): Session => ({ email: person.email, name: person.name, role: "employee", supportGroup: null });
const analyst: Session = { email: "rafael.lima@nexo.com.br", name: "Rafael Lima", role: "analyst", supportGroup: "N2" };

beforeAll(() => {
  process.env.SESSION_SECRET = secret;
  process.env.SERVICEDESK_API_KEY = "test-key";
});

async function request(url: string, session: Session | null, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { host: "localhost:3000", "content-type": "application/json", ...init.headers };
  if (session) headers.cookie = `nexo_session=${await signSession(session, secret, 3600)}`;
  return new NextRequest(`http://localhost:3000${url}`, {
    method: init.method ?? "POST",
    headers,
    ...(init.body !== undefined ? { body: typeof init.body === "string" ? init.body : JSON.stringify(init.body) } : {}),
  });
}

const eventsOf = async (response: Response): Promise<TurnEvent[]> => decodeEvents(await response.text());

const greeting = [
  [call("search_help_center", { query: "VPN erro 809" })],
  [replyCall("O erro 809 se resolve reinstalando o cliente de VPN, mas só no Windows 10.", { confidence: 0.85 })],
];

let harness: ReturnType<typeof createHarness>;
beforeEach(() => {
  harness = createHarness(greeting);
  vi.mocked(getAgentRuntime).mockReturnValue(harness.runtime);
});

describe("POST /api/chat/messages", () => {
  it("starts the conversation and streams the turn as one JSON event per line", async () => {
    const response = await POST(await request("/api/chat/messages", employee(ANA), { body: { content: "Meu notebook não conecta na VPN. Erro 809." } }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    const events = await eventsOf(response);
    expect(events[0]).toMatchObject({ type: "conversation", conversation: { status: "agent", messageCount: 0, messageLimit: 30 } });
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["user_message", "step_start", "step_end", "text", "assistant_message", "conversation", "done"]),
    );
    expect(events.at(-1)).toEqual({ type: "done" });

    const open = harness.deps.conversations.findOpen(ANA.email);
    expect(open?.employee).toMatchObject({ name: "Ana Souza", department: "Financeiro" });
    expect(open?.messageCount).toBe(2);
  });

  it("continues the same conversation on the next message", async () => {
    harness = createHarness([...greeting, [replyCall("De nada!", { intent: "small_talk" })]]);
    vi.mocked(getAgentRuntime).mockReturnValue(harness.runtime);

    const first = await eventsOf(await POST(await request("/api/chat/messages", employee(ANA), { body: { content: "Erro 809 na VPN" } })));
    const id = first[0]?.type === "conversation" ? first[0].conversation.id : "";
    const second = await eventsOf(await POST(await request("/api/chat/messages", employee(ANA), { body: { conversationId: id, content: "Obrigada" } })));

    expect(second.find((event) => event.type === "assistant_message")).toBeDefined();
    expect(harness.deps.conversations.get(id)?.messageCount).toBe(4);
  });

  it("requires a signed-in employee", async () => {
    expect((await POST(await request("/api/chat/messages", null, { body: { content: "Oi" } }))).status).toBe(401);
    expect((await POST(await request("/api/chat/messages", analyst, { body: { content: "Oi" } }))).status).toBe(403);
  });

  it("refuses posts from another origin", async () => {
    const response = await POST(await request("/api/chat/messages", employee(ANA), { body: { content: "Oi" }, headers: { origin: "http://evil.example" } }));
    expect(response.status).toBe(403);
  });

  it.each([
    ["nothing to do", {}],
    ["both a message and an action", { content: "Oi", action: { type: "retry" } }],
    ["an empty message", { content: "   " }],
    ["a message that is too long", { content: "x".repeat(2001) }],
    ["an action without a conversation", { action: { type: "retry" } }],
    ["an unknown action", { conversationId: "c", action: { type: "delete_everything" } }],
  ])("rejects %s", async (_label, body) => {
    expect((await POST(await request("/api/chat/messages", employee(ANA), { body }))).status).toBe(400);
  });

  it("does not let an employee write into someone else's conversation", async () => {
    const own = harness.deps.conversations.start({ email: ANA.email, name: ANA.name, department: ANA.department });
    const response = await POST(await request("/api/chat/messages", employee(CARLA), { body: { conversationId: own.id, content: "Oi" } }));
    expect(response.status).toBe(404);
    expect(harness.deps.conversations.messages(own.id)).toEqual([]);
  });

  it("limits how fast one employee can send", async () => {
    const results: number[] = [];
    for (let attempt = 0; attempt < 21; attempt++) {
      results.push((await POST(await request("/api/chat/messages", employee({ ...CARLA, email: "limite@nexo.com.br" }), { body: {} }))).status);
    }
    expect(results.slice(0, 20).every((status) => status === 400)).toBe(true);
    expect(results[20]).toBe(429);
  });
});

describe("GET /api/chat and POST /api/chat/conversations", () => {
  it("returns the open conversation with the decision behind each answer", async () => {
    await eventsOf(await POST(await request("/api/chat/messages", employee(ANA), { body: { content: "Erro 809 na VPN" } })));

    const state = await (await loadChat(await request("/api/chat", employee(ANA), { method: "GET" }))).json();

    expect(state.conversation).toMatchObject({ status: "agent", messageCount: 2 });
    expect(state.messages.map((message: { role: string }) => message.role)).toEqual(["user", "assistant"]);
    expect(state.messages[1].decision).toMatchObject({ intent: "answer_question", steps: [expect.objectContaining({ tool: "search_help_center" })] });
    expect(state.pendingDraftId).toBeNull();
  });

  it("returns an empty state when there is no conversation yet", async () => {
    const state = await (await loadChat(await request("/api/chat", employee(CARLA), { method: "GET" }))).json();
    expect(state).toEqual({ conversation: null, messages: [], pendingDraftId: null });
  });

  it("starts a new conversation and closes the old one", async () => {
    const old = harness.deps.conversations.start({ email: ANA.email, name: ANA.name, department: ANA.department });

    const response = await startConversation(await request("/api/chat/conversations", employee(ANA)));

    expect(response.status).toBe(201);
    const { conversation } = await response.json();
    expect(conversation.id).not.toBe(old.id);
    expect(harness.deps.conversations.get(old.id)).toMatchObject({ status: "closed", closedBy: "agent" });
  });

  it("will not abandon a conversation that is with an analyst", async () => {
    const open = harness.deps.conversations.start({ email: ANA.email, name: ANA.name, department: ANA.department });
    harness.deps.conversations.handoff(open.id, { reason: "employee_request", group: "N1", summary: "Ana pediu um analista." });

    const response = await startConversation(await request("/api/chat/conversations", employee(ANA)));

    expect(response.status).toBe(409);
    expect(harness.deps.conversations.get(open.id)?.status).toBe("awaiting_analyst");
  });
});
