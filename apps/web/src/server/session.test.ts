import { afterEach, describe, expect, it, vi } from "vitest";

import { SESSION_LIFETIME, homeFor, readSession, signSession, type Session } from "./session";

const secret = "s".repeat(32);
const ana: Session = { email: "ana.souza@nexo.com.br", name: "Ana Souza", role: "employee", supportGroup: null };
const rafael: Session = { email: "rafael.lima@nexo.com.br", name: "Rafael Lima", role: "analyst", supportGroup: "N2" };

afterEach(() => vi.useRealTimers());

describe("session token", () => {
  it("round-trips employees and analysts", async () => {
    expect(await readSession(await signSession(ana, secret, 60), secret)).toEqual(ana);
    expect(await readSession(await signSession(rafael, secret, 60), secret)).toEqual(rafael);
  });

  it("rejects a missing token", async () => {
    expect(await readSession(undefined, secret)).toBeNull();
    expect(await readSession("", secret)).toBeNull();
  });

  it("rejects a token signed with another secret", async () => {
    const forged = await signSession(rafael, "f".repeat(32), 60);
    expect(await readSession(forged, secret)).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const [header, , signature] = (await signSession(ana, secret, 60)).split(".");
    const payload = Buffer.from(JSON.stringify({ sub: ana.email, name: ana.name, role: "analyst" })).toString("base64url");
    expect(await readSession(`${header}.${payload}.${signature}`, secret)).toBeNull();
  });

  it("rejects an expired token", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-28T10:00:00Z"));
    const token = await signSession(ana, secret, SESSION_LIFETIME.browser);
    vi.setSystemTime(new Date("2026-10-28T22:00:01Z"));
    expect(await readSession(token, secret)).toBeNull();
  });

  it("sends each role to its own home", () => {
    expect(homeFor("employee")).toBe("/chat");
    expect(homeFor("analyst")).toBe("/console");
  });
});
