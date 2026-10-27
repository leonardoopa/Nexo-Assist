import { NextResponse, type NextRequest } from "next/server";

import { isSameOrigin, jsonError } from "@/server/http";
import { SESSION_COOKIE } from "@/server/session";

export function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("forbidden_origin", "Origem não permitida.", 403);

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  const response = NextResponse.redirect(login, 303);
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
