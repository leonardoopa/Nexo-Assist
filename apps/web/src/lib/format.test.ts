import { describe, expect, it } from "vitest";

import {
  daysSince,
  firstName,
  formatClock,
  formatDateTime,
  formatDaysAgo,
  formatDraftId,
  formatShortDate,
  formatUntil,
  initials,
} from "./format";

describe("dates in the company timezone", () => {
  it("formats times and days in Sao Paulo, not in UTC", () => {
    expect(formatClock("2026-10-28T16:43:00Z")).toBe("13:43");
    expect(formatClock("2026-10-28T02:05:00Z")).toBe("23:05");
    expect(formatShortDate("2026-10-16T17:20:00Z")).toBe("16 out");
    expect(formatDateTime("2026-10-16T17:20:00Z")).toBe("16 out, 14:20");
  });

  it("says 'até' with only the time when it is today", () => {
    const now = new Date("2026-10-28T13:00:00Z");
    expect(formatUntil("2026-10-28T20:42:00Z", now)).toBe("até 17:42");
    expect(formatUntil("2026-10-30T13:00:00Z", now)).toBe("até 30 out, 10:00");
  });

  it("names drafts with three digits", () => {
    expect(formatDraftId(381)).toBe("D-381");
    expect(formatDraftId(7)).toBe("D-007");
  });
});

describe("format", () => {
  it("counts whole days and never goes negative", () => {
    const now = new Date("2026-10-28T12:00:00Z");
    expect(daysSince("2026-09-16T12:00:00Z", now)).toBe(42);
    expect(daysSince("2026-10-27T13:00:00Z", now)).toBe(0);
    expect(daysSince("2026-10-30T12:00:00Z", now)).toBe(0);
  });

  it("writes days in Portuguese", () => {
    expect(formatDaysAgo(0)).toBe("hoje");
    expect(formatDaysAgo(1)).toBe("há 1 dia");
    expect(formatDaysAgo(42)).toBe("há 42 dias");
  });

  it("builds initials from the first and last name", () => {
    expect(initials("Ana Souza")).toBe("AS");
    expect(initials("  maria  de  Lourdes Silva ")).toBe("MS");
    expect(initials("Madonna")).toBe("M");
    expect(initials("")).toBe("");
  });

  it("takes the first name", () => {
    expect(firstName("Ana Souza")).toBe("Ana");
  });
});
