import { describe, expect, it } from "vitest";

import { authenticate, loginInputSchema, type Directory } from "./login";

const directory: Directory = {
  async getUser(email) {
    if (email === "ana.souza@nexo.com.br") {
      return { email, name: "Ana Souza", role: "employee", supportGroup: null };
    }
    if (email === "rafael.lima@nexo.com.br") {
      return { email, name: "Rafael Lima", role: "analyst", supportGroup: "N2" };
    }
    return null;
  },
};

const input = (email: string, password = "qualquer") => loginInputSchema.parse({ email, password });

describe("authenticate", () => {
  it("accepts a sample employee with any password and sends them to the chat", async () => {
    const result = await authenticate(input("ana.souza@nexo.com.br", "123"), directory);
    expect(result).toEqual({
      ok: true,
      session: { email: "ana.souza@nexo.com.br", name: "Ana Souza", role: "employee", supportGroup: null },
      home: "/chat",
    });
  });

  it("sends analysts to the console and keeps their group", async () => {
    const result = await authenticate(input("rafael.lima@nexo.com.br"), directory);
    expect(result).toMatchObject({ ok: true, home: "/console", session: { role: "analyst", supportGroup: "N2" } });
  });

  it("refuses an e-mail the directory does not know", async () => {
    expect(await authenticate(input("intruso@nexo.com.br"), directory)).toEqual({ ok: false });
  });
});

describe("loginInputSchema", () => {
  it("trims and lowercases the e-mail and defaults remember to false", () => {
    expect(loginInputSchema.parse({ email: "  Ana.Souza@Nexo.com.br ", password: "x" })).toEqual({
      email: "ana.souza@nexo.com.br",
      password: "x",
      remember: false,
    });
  });

  it("requires a valid e-mail and a non-empty password", () => {
    expect(loginInputSchema.safeParse({ email: "ana", password: "x" }).success).toBe(false);
    expect(loginInputSchema.safeParse({ email: "ana@nexo.com.br", password: "" }).success).toBe(false);
  });
});
