export interface RetryPolicy {
  /** Total tries, the first one included. */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Longest `Retry-After` the client is willing to honour. */
  maxRetryAfterMs: number;
}

export const defaultRetryPolicy: RetryPolicy = {
  maxAttempts: 4,
  baseDelayMs: 250,
  maxDelayMs: 2000,
  maxRetryAfterMs: 5000,
};

/** Gateway-style failures: the legacy system is down for a moment, so trying again can work. */
export const RETRYABLE_STATUS: ReadonlySet<number> = new Set([502, 503, 504]);

/** Exponential backoff with jitter (50% to 100% of the step); `Retry-After` is a floor, capped by the policy. */
export function backoffDelay(
  attempt: number,
  policy: RetryPolicy,
  random: () => number,
  retryAfterMs?: number,
): number {
  const step = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
  const jittered = step * (0.5 + random() / 2);
  if (retryAfterMs === undefined) return jittered;
  return Math.min(Math.max(jittered, retryAfterMs), policy.maxRetryAfterMs);
}

/** `Retry-After` in seconds, as the service sends it. HTTP dates are not used by this service. */
export function parseRetryAfter(header: string | null): number | undefined {
  if (header === null) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}
