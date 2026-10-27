import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceDeskUnavailableError, getServiceDesk } from "@/server/servicedesk";
import { readSession } from "@/server/session";

import { POST } from "./route";

vi.mock("@/server/servicedesk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/servicedesk")>()),
  getServiceDesk: vi.fn(),
}));

const secret = "t".repeat(32);

const directory = {
  getUser: vi.fn(async (email: string) => {
    if (email === "ana.souza@nexo.com.br") return { email, name: "Ana Souza", role: "employee", supportGroup: null };
    if (email === "rafael.lima@nexo.com.br") return { email, name: "Rafael Lima", role: "analyst", supportGroup: "N2" };
    return null;
  }),
};

beforeAll(() => {
  process.env.SESSION_SECRET = secret;
  process.env.SERVICEDESK_API_KEY = "test-key";
});

beforeEach(() => {
  vi.mocked(getServiceDesk).mockReturnValue(directory as unknown as ReturnType<typeof getServiceDesk>);
});

let clients = 0;

/** Each call comes from a new client address unless a test pins one, so rate limits do not leak between tests. */
function login(body: unknown, headers: Record<string, string> = {}) {
  clients += 1;
  return POST(
    new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "localhost:3000",
        "x-forwarded-for": `10.0.0.${clients}`,
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("POST /api/auth/login", () => {
  it("signs in a sample employee with any password and sets an HttpOnly session cookie", async () => {
    const response = await login({ email: "ana.souza@nexo.com.br", password: "qualquer" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ redirectTo: "/chat" });
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/nexo_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).not.toMatch(/Max-Age/i); // a session cookie unless asked to remember
    expect(cookie).not.toMatch(/Secure/i);
    expect(await readSession(response.cookies.get("nexo_session")?.value, secret)).toMatchObject({
      email: "ana.souza@nexo.com.br",
      role: "employee",
    });
  });

  it("keeps the cookie for 30 days when asked to remember", async () => {
    const response = await login({ email: "ana.souza@nexo.com.br", password: "x", remember: true });
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=2592000/);
  });

  it("marks the cookie Secure behind HTTPS", async () => {
    const response = await login({ email: "ana.souza@nexo.com.br", password: "x" }, { "x-forwarded-proto": "https" });
    expect(response.headers.get("set-cookie")).toMatch(/Secure/i);
  });

  it("sends analysts to the console", async () => {
    const response = await login({ email: "Rafael.Lima@Nexo.com.br ", password: "x" });
    expect(await response.json()).toEqual({ redirectTo: "/console" });
  });

  it("refuses an unknown e-mail and sets no cookie", async () => {
    const response = await login({ email: "intruso@nexo.com.br", password: "x" });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_credentials" } });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("refuses malformed input", async () => {
    expect((await login({ email: "ana.souza@nexo.com.br" })).status).toBe(400);
    expect((await login({ email: "isso-nao-e-email", password: "x" })).status).toBe(400);
    expect((await login("not json")).status).toBe(400);
  });

  it("refuses posts that come from another origin", async () => {
    const response = await login({ email: "ana.souza@nexo.com.br", password: "x" }, { origin: "http://evil.example" });
    expect(response.status).toBe(403);
  });

  it("limits attempts per client", async () => {
    const pinned = { "x-forwarded-for": "203.0.113.9" };
    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await login({ email: "intruso@nexo.com.br", password: "x" }, pinned)).status).toBe(401);
    }
    const blocked = await login({ email: "intruso@nexo.com.br", password: "x" }, pinned);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("answers 503 when the directory cannot be reached", async () => {
    directory.getUser.mockRejectedValueOnce(new ServiceDeskUnavailableError("fora do ar", "legacy_unavailable", 503));
    const response = await login({ email: "ana.souza@nexo.com.br", password: "x" });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "directory_unavailable" } });
  });
});
