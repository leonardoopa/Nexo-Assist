import { describe, expect, it } from "vitest";

import { ANA_TICKETS } from "@/test/fixtures";

import { groupFor, validateHandoff } from "./handoff";

const overdue = ANA_TICKETS.find((ticket) => ticket.id === "INC-20311")!;
const onTime = ANA_TICKETS.find((ticket) => ticket.id === "INC-20298")!;

describe("groupFor", () => {
  it("sends critical and overdue cases to N2 and the rest to N1", () => {
    expect(groupFor("critical")).toBe("N2");
    expect(groupFor("overdue")).toBe("N2");
    expect(groupFor("employee_request")).toBe("N1");
    expect(groupFor("low_confidence")).toBe("N1");
  });
});

describe("validateHandoff", () => {
  it("accepts an overdue transfer only for a ticket that is really overdue", () => {
    expect(validateHandoff({ reason: "overdue", ticket: overdue, criticalClassified: false })).toEqual({ ok: true });
    expect(validateHandoff({ reason: "overdue", ticket: onTime, criticalClassified: false })).toMatchObject({ ok: false });
    expect(validateHandoff({ reason: "overdue", ticket: null, criticalClassified: false })).toMatchObject({ ok: false });
  });

  it("accepts a critical transfer only after a critical classification", () => {
    expect(validateHandoff({ reason: "critical", ticket: null, criticalClassified: true })).toEqual({ ok: true });
    expect(validateHandoff({ reason: "critical", ticket: null, criticalClassified: false })).toMatchObject({ ok: false });
  });

  it("leaves the employee's request and the agent's doubt to its own judgment", () => {
    expect(validateHandoff({ reason: "employee_request", ticket: null, criticalClassified: false })).toEqual({ ok: true });
    expect(validateHandoff({ reason: "low_confidence", ticket: null, criticalClassified: false })).toEqual({ ok: true });
  });
});
