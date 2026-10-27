import { describe, expect, it } from "vitest";

import { parseEnv } from "./env";

const valid = {
  SESSION_SECRET: "x".repeat(32),
  SERVICEDESK_API_KEY: "dev-key",
};

describe("parseEnv", () => {
  it("applies defaults for optional settings", () => {
    expect(parseEnv(valid)).toEqual({
      SESSION_SECRET: "x".repeat(32),
      SERVICEDESK_API_KEY: "dev-key",
      SERVICEDESK_URL: "http://localhost:8100",
      DATABASE_PATH: "./data/nexo-assist.db",
      CHAT_MESSAGE_LIMIT: 30,
    });
  });

  it("reads numbers and URLs from strings", () => {
    const env = parseEnv({ ...valid, CHAT_MESSAGE_LIMIT: "12", SERVICEDESK_URL: "http://servicedesk:8000" });
    expect(env.CHAT_MESSAGE_LIMIT).toBe(12);
    expect(env.SERVICEDESK_URL).toBe("http://servicedesk:8000");
  });

  it("lists every problem instead of failing on the first", () => {
    expect(() => parseEnv({ SESSION_SECRET: "short" })).toThrowError(/SESSION_SECRET[\s\S]*SERVICEDESK_API_KEY/);
  });

  it("never falls back to a built-in secret", () => {
    expect(() => parseEnv({ SERVICEDESK_API_KEY: "dev-key" })).toThrowError(/SESSION_SECRET/);
  });
});
