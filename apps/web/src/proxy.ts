import { NextResponse, type NextRequest } from "next/server";

import { getEnv } from "@/server/env";
import { SESSION_COOKIE, homeFor, readSession } from "@/server/session";

const EMPLOYEE_AREAS = ["/chat", "/profile"];
const ANALYST_AREAS = ["/console"];

const inside = (pathname: string, area: string) => pathname === area || pathname.startsWith(`${area}/`);

/**
 * Optimistic redirects only: it reads the signed cookie and never touches data. Pages and route
 * handlers still check the session themselves (`requireSession`), as close to the data as possible.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await readSession(request.cookies.get(SESSION_COOKIE)?.value, getEnv().SESSION_SECRET);

  const go = (path: string) => {
    const target = request.nextUrl.clone();
    target.pathname = path;
    target.search = "";
    return NextResponse.redirect(target);
  };

  if (pathname === "/login") return session ? go(homeFor(session.role)) : NextResponse.next();
  if (!session) return go("/login");
  if (EMPLOYEE_AREAS.some((area) => inside(pathname, area)) && session.role !== "employee") {
    return go(homeFor(session.role));
  }
  if (ANALYST_AREAS.some((area) => inside(pathname, area)) && session.role !== "analyst") {
    return go(homeFor(session.role));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
