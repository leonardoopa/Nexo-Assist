import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";

import { roleSchema, supportGroupSchema, type Role } from "@/lib/domain";

export const SESSION_COOKIE = "nexo_session";

/** Seconds. "Keep me signed in" survives the browser; otherwise the cookie dies with it. */
export const SESSION_LIFETIME = { remember: 60 * 60 * 24 * 30, browser: 60 * 60 * 12 } as const;

export const sessionSchema = z.object({
  email: z.email(),
  name: z.string().min(1),
  role: roleSchema,
  supportGroup: supportGroupSchema.nullable(),
});
export type Session = z.infer<typeof sessionSchema>;

export const homeFor = (role: Role): string => (role === "analyst" ? "/console" : "/chat");

const keyFor = (secret: string) => new TextEncoder().encode(secret);

/** Signed (not encrypted) token: the cookie is HttpOnly and holds only who the person is. */
export function signSession(session: Session, secret: string, lifetimeSeconds: number): Promise<string> {
  return new SignJWT({ name: session.name, role: session.role, group: session.supportGroup })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.email)
    .setIssuedAt()
    .setExpirationTime(`${lifetimeSeconds}s`)
    .sign(keyFor(secret));
}

/** Returns the session, or null for anything missing, forged, expired or malformed. */
export async function readSession(token: string | undefined, secret: string): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, keyFor(secret), { algorithms: ["HS256"] });
    const parsed = sessionSchema.safeParse({
      email: payload.sub,
      name: payload.name,
      role: payload.role,
      supportGroup: payload.group ?? null,
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
