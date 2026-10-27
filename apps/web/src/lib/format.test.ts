import { describe, expect, it } from "vitest";

import { daysSince, firstName, formatDaysAgo, initials } from "./format";

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
