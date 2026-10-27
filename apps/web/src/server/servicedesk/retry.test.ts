import { describe, expect, it } from "vitest";

import { backoffDelay, defaultRetryPolicy, parseRetryAfter } from "./retry";

const policy = { ...defaultRetryPolicy, baseDelayMs: 100, maxDelayMs: 1000, maxRetryAfterMs: 3000 };

describe("backoffDelay", () => {
  it("doubles each attempt, with jitter between 50% and 100% of the step", () => {
    expect(backoffDelay(1, policy, () => 1)).toBe(100);
    expect(backoffDelay(1, policy, () => 0)).toBe(50);
    expect(backoffDelay(2, policy, () => 1)).toBe(200);
    expect(backoffDelay(3, policy, () => 1)).toBe(400);
  });

  it("never exceeds the maximum step", () => {
    expect(backoffDelay(10, policy, () => 1)).toBe(1000);
  });

  it("treats Retry-After as a floor, capped by the policy", () => {
    expect(backoffDelay(1, policy, () => 1, 2000)).toBe(2000);
    expect(backoffDelay(1, policy, () => 1, 60_000)).toBe(3000);
    expect(backoffDelay(3, policy, () => 1, 10)).toBe(400);
  });
});

describe("parseRetryAfter", () => {
  it("reads seconds", () => {
    expect(parseRetryAfter("2")).toBe(2000);
    expect(parseRetryAfter("0")).toBe(0);
  });

  it("ignores missing or unusable values", () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("soon")).toBeUndefined();
    expect(parseRetryAfter("-3")).toBeUndefined();
  });
});
