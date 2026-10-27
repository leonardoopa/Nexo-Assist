import "server-only";

import { cache } from "react";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { Role } from "@/lib/domain";
import { getEnv } from "@/server/env";
import { SESSION_COOKIE, homeFor, readSession, type Session } from "@/server/session";

/** The signed-in person, read once per request. The proxy only does optimistic redirects; this is the real check. */
export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return readSession(token, getEnv().SESSION_SECRET);
});

/** For pages: no session goes to the login, the wrong role goes to its own home. */
export async function requireSession(role: Role): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== role) redirect(homeFor(session.role));
  return session;
}
