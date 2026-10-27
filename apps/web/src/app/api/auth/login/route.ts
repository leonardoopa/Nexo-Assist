import { NextResponse, type NextRequest } from "next/server";

import { authenticate, loginInputSchema } from "@/server/auth/login";
import { getEnv } from "@/server/env";
import { clientKey, isSameOrigin, isSecureRequest, jsonError } from "@/server/http";
import { createRateLimiter } from "@/server/rate-limit";
import { ServiceDeskError, getServiceDesk } from "@/server/servicedesk";
import { SESSION_COOKIE, SESSION_LIFETIME, signSession } from "@/server/session";

// Any password works for the sample people, so attempts are limited per client to keep the form from being scraped.
const attempts = createRateLimiter({ limit: 10, windowMs: 5 * 60_000 });

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("forbidden_origin", "Origem não permitida.", 403);

  const limit = attempts.check(clientKey(request));
  if (!limit.allowed) {
    return jsonError(
      "too_many_attempts",
      `Muitas tentativas. Tente de novo em ${limit.retryAfterSeconds} s.`,
      429,
      { "Retry-After": String(limit.retryAfterSeconds) },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const input = loginInputSchema.safeParse(body);
  if (!input.success) return jsonError("invalid_input", "Informe o e-mail corporativo e a senha.", 400);

  let result;
  try {
    result = await authenticate(input.data, getServiceDesk());
  } catch (error) {
    if (error instanceof ServiceDeskError) {
      return jsonError(
        "directory_unavailable",
        "O sistema do service desk está instável agora. Tente de novo em instantes.",
        503,
        { "Retry-After": "5" },
      );
    }
    throw error;
  }
  if (!result.ok) return jsonError("invalid_credentials", "E-mail ou senha inválidos.", 401);

  const lifetime = input.data.remember ? SESSION_LIFETIME.remember : SESSION_LIFETIME.browser;
  const token = await signSession(result.session, getEnv().SESSION_SECRET, lifetime);
  const response = NextResponse.json({ redirectTo: result.home });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    // Without maxAge it is a session cookie that goes away with the browser.
    ...(input.data.remember ? { maxAge: lifetime } : {}),
  });
  return response;
}
