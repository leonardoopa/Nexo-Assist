export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
}

interface Options {
  limit: number;
  windowMs: number;
  now?: () => number;
}

/** Fixed-window counter kept in memory: enough for one instance, which is how this app is deployed. */
export function createRateLimiter({ limit, windowMs, now = Date.now }: Options): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();

  return {
    check(key) {
      const current = now();
      if (windows.size > 5000) {
        for (const [candidate, window] of windows) {
          if (window.resetAt <= current) windows.delete(candidate);
        }
      }
      let window = windows.get(key);
      if (!window || window.resetAt <= current) {
        window = { count: 0, resetAt: current + windowMs };
        windows.set(key, window);
      }
      window.count += 1;
      return {
        allowed: window.count <= limit,
        retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - current) / 1000)),
      };
    },
  };
}
