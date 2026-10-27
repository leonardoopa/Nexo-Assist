import { z } from "zod";

import type { Role, SupportGroup } from "@/lib/domain";
import { homeFor, type Session } from "@/server/session";

export const loginInputSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(200),
  remember: z.boolean().default(false),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export interface DirectoryUser {
  email: string;
  name: string;
  role: Role;
  supportGroup: SupportGroup | null;
}

/** What sign-in needs from the company directory (served by the legacy service desk). */
export interface Directory {
  getUser(email: string): Promise<DirectoryUser | null>;
}

export type LoginResult = { ok: true; session: Session; home: string } | { ok: false };

/**
 * Challenge scope (PRD, screen 1): every person in the sample directory signs in with any
 * non-empty password. The password is checked for presence only, never stored or compared.
 */
export async function authenticate(input: LoginInput, directory: Directory): Promise<LoginResult> {
  const user = await directory.getUser(input.email);
  if (!user) return { ok: false };
  return {
    ok: true,
    session: { email: user.email, name: user.name, role: user.role, supportGroup: user.supportGroup },
    home: homeFor(user.role),
  };
}
