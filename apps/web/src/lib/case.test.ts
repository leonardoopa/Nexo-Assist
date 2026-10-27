import { describe, expect, it } from "vitest";

import { camelizeKeys, snakeizeKeys } from "./case";

describe("case conversion", () => {
  it("camelizes nested keys and leaves values alone", () => {
    const input = { due_at: "2026-10-28T17:00:00Z", events: [{ to_group: "N2", meta: { to_group: "N2" } }], total: 3 };
    expect(camelizeKeys(input)).toEqual({
      dueAt: "2026-10-28T17:00:00Z",
      events: [{ toGroup: "N2", meta: { toGroup: "N2" } }],
      total: 3,
    });
  });

  it("snakeizes request bodies", () => {
    expect(snakeizeKeys({ toGroup: "N2", reason: "overdue" })).toEqual({ to_group: "N2", reason: "overdue" });
  });

  it("passes primitives and null through", () => {
    expect(camelizeKeys(null)).toBeNull();
    expect(camelizeKeys("some_value")).toBe("some_value");
  });
});
