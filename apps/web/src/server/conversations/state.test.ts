import { describe, expect, it } from "vitest";

import { ConversationError } from "./errors";
import { agentMayReply, countsTowardLimit, transition } from "./state";

describe("conversation transitions", () => {
  it("follows the handoff life cycle", () => {
    expect(transition("agent", "handoff")).toBe("awaiting_analyst");
    expect(transition("awaiting_analyst", "assume")).toBe("with_analyst");
    expect(transition("with_analyst", "return_to_agent")).toBe("agent");
    expect(transition("with_analyst", "close")).toBe("closed");
    expect(transition("agent", "close")).toBe("closed");
  });

  it.each([
    ["agent", "assume"],
    ["agent", "return_to_agent"],
    ["awaiting_analyst", "close"],
    ["awaiting_analyst", "handoff"],
    ["with_analyst", "handoff"],
    ["closed", "assume"],
    ["closed", "close"],
  ] as const)("refuses %s -> %s", (status, name) => {
    expect(() => transition(status, name)).toThrowError(ConversationError);
  });

  it("lets the assistant speak only while it owns the conversation", () => {
    expect(agentMayReply("agent")).toBe(true);
    expect(agentMayReply("awaiting_analyst")).toBe(false);
    expect(agentMayReply("with_analyst")).toBe(false);
    expect(agentMayReply("closed")).toBe(false);
  });

  it("counts only employee and assistant messages toward the limit", () => {
    expect(countsTowardLimit("user")).toBe(true);
    expect(countsTowardLimit("assistant")).toBe(true);
    expect(countsTowardLimit("analyst")).toBe(false);
    expect(countsTowardLimit("system")).toBe(false);
  });
});
