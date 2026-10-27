import "server-only";

import type { NextRequest, NextResponse } from "next/server";

import { getEnv } from "@/server/env";
import { jsonError } from "@/server/http";
import { SESSION_COOKIE, readSession, type Session } from "@/server/session";

/** Route handlers read the cookie from the request itself; pages use `requireSession`. */
export async function sessionFromRequest(request: NextRequest): Promise<Session | null> {
  return readSession(request.cookies.get(SESSION_COOKIE)?.value, getEnv().SESSION_SECRET);
}

/** The signed-in analyst, or the 401/403 response to send back. */
export async function requireAnalyst(request: NextRequest): Promise<{ session: Session } | { response: NextResponse }> {
  const session = await sessionFromRequest(request);
  if (!session) return { response: jsonError("unauthenticated", "Entre para continuar.", 401) };
  if (session.role !== "analyst") return { response: jsonError("forbidden", "O console é para analistas.", 403) };
  return { session };
}

/** The signed-in employee, or the 401/403 response to send back. Analysts have their own endpoints. */
export async function requireEmployee(request: NextRequest): Promise<{ session: Session } | { response: NextResponse }> {
  const session = await sessionFromRequest(request);
  if (!session) return { response: jsonError("unauthenticated", "Entre para continuar.", 401) };
  if (session.role !== "employee") return { response: jsonError("forbidden", "Este atendimento é para funcionários.", 403) };
  return { session };
}
