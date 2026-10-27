import { describe, expect, it } from "vitest";

import type { TurnEvent } from "@/server/chat/events";
import type { MessageView } from "@/server/chat/view";
import type { DraftPart } from "@/server/conversations/types";

import { chatReducer, initialChatState, pendingDraftOf, type ChatState } from "./chat-reducer";

const message = (overrides: Partial<MessageView> & Pick<MessageView, "id" | "role">): MessageView => ({
  seq: 1,
  authorName: null,
  content: "texto",
  parts: [],
  createdAt: "2026-10-28T13:00:00Z",
  decision: null,
  ...overrides,
});

const draft = (draftId: number, status: DraftPart["status"]): DraftPart => ({
  type: "draft",
  draftId,
  kind: "ticket_create",
  status,
  ticketId: null,
  title: "VPN não conecta",
  description: "Erro 809 desde ontem.",
  category: "rede_vpn",
  subcategory: null,
  priority: "alta",
  affected: "me",
  slaLabel: "4 horas úteis",
  dueAt: null,
  similar: [],
});

const start = (): ChatState => initialChatState({ conversation: null, messages: [], pendingDraftId: null });
const apply = (state: ChatState, ...events: TurnEvent[]) => events.reduce((current, event) => chatReducer(current, { type: "event", event }), state);

describe("chatReducer", () => {
  it("follows a turn from the first step to the stored answer", () => {
    const running = chatReducer(start(), { type: "turn_started" });
    expect(running.turn.running).toBe(true);

    const streaming = apply(
      running,
      { type: "user_message", message: message({ id: "u1", role: "user", content: "Erro 809 na VPN" }) },
      { type: "step_start", id: "s1", tool: "search_help_center", label: "buscando na central de ajuda" },
      { type: "step_end", id: "s1", tool: "search_help_center", label: "buscou na central de ajuda", status: "ok", summary: "1 artigo", durationMs: 12 },
      { type: "text", delta: "O erro " },
      { type: "text", delta: "809 vale só no Windows 10." },
    );
    expect(streaming.turn.steps).toEqual([
      { id: "s1", tool: "search_help_center", label: "buscou na central de ajuda", status: "ok", summary: "1 artigo", durationMs: 12 },
    ]);
    expect(streaming.turn.text).toBe("O erro 809 vale só no Windows 10.");

    const done = apply(
      streaming,
      { type: "assistant_message", message: message({ id: "a1", role: "assistant", content: "O erro 809 vale só no Windows 10." }) },
      { type: "done" },
    );
    expect(done.messages.map((entry) => entry.id)).toEqual(["u1", "a1"]);
    expect(done.turn).toEqual({ running: false, steps: [], text: "" });
  });

  it("shows a step as running until it ends, and adds one that only reports its end", () => {
    const state = apply(
      start(),
      { type: "step_start", id: "s1", tool: "get_ticket", label: "consultando o INC-20311" },
      { type: "step_end", id: "s2", tool: "calculate_deadline", label: "calculou o prazo", status: "error", summary: "falhou", durationMs: 3 },
    );
    expect(state.turn.steps.map((step) => [step.id, step.status])).toEqual([
      ["s1", "running"],
      ["s2", "error"],
    ]);
  });

  it("ignores a message it already has", () => {
    const user = message({ id: "u1", role: "user" });
    const state = apply(start(), { type: "user_message", message: user }, { type: "user_message", message: user });
    expect(state.messages).toHaveLength(1);
  });

  it("tracks the draft that waits for a decision, and forgets it once the stored card says it was decided", () => {
    const withDraft = apply(start(), {
      type: "assistant_message",
      message: message({ id: "a1", role: "assistant", parts: [draft(1, "pending")] }),
    });
    expect(withDraft.pendingDraftId).toBe(1);

    const decided = chatReducer(withDraft, {
      type: "loaded",
      state: { conversation: null, messages: [message({ id: "a1", role: "assistant", parts: [draft(1, "confirmed")] })], pendingDraftId: null },
    });
    expect(decided.pendingDraftId).toBeNull();
  });

  it("lets the latest draft card decide which draft is pending", () => {
    const messages = [
      message({ id: "a1", role: "assistant", parts: [draft(1, "superseded")] }),
      message({ id: "a2", role: "assistant", parts: [draft(2, "pending")] }),
    ];
    expect(pendingDraftOf(messages)).toBe(2);
    expect(pendingDraftOf([messages[1]!, message({ id: "a3", role: "assistant", parts: [draft(3, "confirmed")] })])).toBeNull();
    expect(pendingDraftOf([])).toBeNull();
  });

  it("keeps the employee's message when the turn fails, and clears the error when a new turn starts", () => {
    const failed = apply(
      chatReducer(start(), { type: "turn_started" }),
      { type: "user_message", message: message({ id: "u1", role: "user" }) },
      { type: "step_start", id: "s1", tool: "x", label: "…" },
      { type: "error", code: "llm_rate_limited", message: "Tente de novo.", retryable: true },
      { type: "done" },
    );
    expect(failed.error).toEqual({ code: "llm_rate_limited", message: "Tente de novo.", retryable: true });
    expect(failed.messages).toHaveLength(1);
    expect(failed.turn).toEqual({ running: false, steps: [], text: "" });

    expect(chatReducer(failed, { type: "turn_started" }).error).toBeNull();
  });

  it("reports a transport failure and goes idle", () => {
    const state = chatReducer(chatReducer(start(), { type: "turn_started" }), {
      type: "failed",
      error: { code: "network", message: "Sem conexão.", retryable: true },
    });
    expect(state.error?.code).toBe("network");
    expect(state.turn.running).toBe(false);
  });
});
