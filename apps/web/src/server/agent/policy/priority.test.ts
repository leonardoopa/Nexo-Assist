import { describe, expect, it } from "vitest";

import { classifyPriority, type PriorityFacts } from "./priority";

const facts = (overrides: Partial<PriorityFacts>): PriorityFacts => ({
  type: "INC",
  affected: "me",
  blocking: false,
  commitmentToday: false,
  ...overrides,
});

describe("classifyPriority (Annex A)", () => {
  it.each([
    ["stopped for a team", { affected: "team", blocking: true }, "critica", "team_blocked"],
    ["stopped for the company", { affected: "company", blocking: true }, "critica", "team_blocked"],
    ["stops one person", { blocking: true }, "alta", "person_blocked"],
    ["a same-day commitment", { commitmentToday: true }, "alta", "commitment_today"],
    ["a same-day commitment for a team that is not stopped", { affected: "team", commitmentToday: true }, "alta", "commitment_today"],
    ["a request without urgency", { type: "REQ" }, "baixa", "request_without_urgency"],
    ["bothers but has an alternative", {}, "media", "default"],
    ["bothers a whole team without stopping it", { affected: "team" }, "media", "default"],
  ] as const)("%s -> %s", (_label, overrides, priority, rule) => {
    expect(classifyPriority(facts(overrides))).toMatchObject({ priority, rule });
  });

  it("lets urgency beat the request default: an urgent request is not low", () => {
    expect(classifyPriority(facts({ type: "REQ", commitmentToday: true })).priority).toBe("alta");
    expect(classifyPriority(facts({ type: "REQ", blocking: true })).priority).toBe("alta");
  });

  it("treats an unknown audience as one person and says so", () => {
    const decision = classifyPriority(facts({ affected: "unknown", blocking: true }));
    expect(decision.priority).toBe("alta");
    expect(decision.rationale).toMatch(/só você/);
  });
});
