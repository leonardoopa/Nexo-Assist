import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { POST } from "./route";

const logout = (headers: Record<string, string> = {}) =>
  POST(
    new NextRequest("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: { host: "localhost:3000", cookie: "nexo_session=abc", ...headers },
    }),
  );

describe("POST /api/auth/logout", () => {
  it("clears the session cookie and goes back to the login", async () => {
    const response = await logout();

    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/login");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/nexo_session=;/);
    expect(cookie).toMatch(/Max-Age=0/);
  });

  it("refuses posts that come from another origin", async () => {
    expect((await logout({ origin: "http://evil.example" })).status).toBe(403);
  });
});
