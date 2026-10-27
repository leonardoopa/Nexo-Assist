import { describe, expect, it } from "vitest";

import { createRateLimiter } from "./rate-limit";

describe("rate limiter", () => {
  it("allows up to the limit, then blocks until the window ends", () => {
    let clock = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 10_000, now: () => clock });

    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(true);
    const blocked = limiter.check("ip");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(10);

    clock = 10_000;
    expect(limiter.check("ip").allowed).toBe(true);
  });

  it("counts each key separately", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
  });
});
