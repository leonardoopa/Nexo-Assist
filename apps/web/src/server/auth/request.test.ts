import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE, signSession, type Session } from "@/server/session";

import { requireAnalyst, requireEmployee } from "./request";

const secret = "t".repeat(32);
const ana: Session = { email: "ana.souza@nexo.com.br", name: "Ana Souza", role: "employee", supportGroup: null };
const rafael: Session = { email: "rafael.lima@nexo.com.br", name: "Rafael Lima", role: "analyst", supportGroup: "N2" };

beforeAll(() => {
  vi.stubEnv("SESSION_SECRET", secret);
  vi.stubEnv("SERVICEDESK_API_KEY", "test-key");
});

async function requestAs(session: Session | null): Promise<NextRequest> {
  const headers = new Headers();
  if (session) headers.set("cookie", `${SESSION_COOKIE}=${await signSession(session, secret, 60)}`);
  return new NextRequest("http://localhost/api/console/conversations", { headers });
}

async function errorOf(result: { response: Response } | { session: Session }) {
  if (!("response" in result)) throw new Error("expected a refusal");
  return { status: result.response.status, code: ((await result.response.json()) as { error: { code: string } }).error.code };
}

describe("requireAnalyst", () => {
  it("lets an analyst in", async () => {
    expect(await requireAnalyst(await requestAs(rafael))).toEqual({ session: rafael });
  });

  it("asks someone who is not signed in to sign in", async () => {
    expect(await errorOf(await requireAnalyst(await requestAs(null)))).toEqual({ status: 401, code: "unauthenticated" });
  });

  it("keeps employees out of the console", async () => {
    expect(await errorOf(await requireAnalyst(await requestAs(ana)))).toEqual({ status: 403, code: "forbidden" });
  });
});

describe("requireEmployee", () => {
  it("lets an employee in and keeps analysts out of the employee chat", async () => {
    expect(await requireEmployee(await requestAs(ana))).toEqual({ session: ana });
    expect(await errorOf(await requireEmployee(await requestAs(rafael)))).toEqual({ status: 403, code: "forbidden" });
  });
});
