import { describe, expect, it, vi } from "vitest";

import { ServiceDeskClient } from "./client";
import { ServiceDeskApiError, ServiceDeskContractError, ServiceDeskUnavailableError } from "./errors";

const ana = "ana.souza@nexo.com.br";

const person = { email: ana, name: "Ana Souza", department: "Financeiro", support_group: null };
const ticketJson = {
  id: "INC-20520",
  type: "INC",
  title: "VPN não conecta no notebook, erro 809",
  description: "Desde ontem o notebook não conecta na VPN e mostra o erro 809.",
  category: "rede_vpn",
  subcategory: null,
  priority: "alta",
  status: "aberto",
  affected: "me",
  requester: person,
  assignee: null,
  assigned_group: null,
  created_at: "2026-10-28T13:00:00Z",
  updated_at: "2026-10-28T13:00:00Z",
  last_response_at: "2026-10-28T13:00:00Z",
  resolved_at: null,
  resolution: null,
  sla: { label: "4 horas úteis", due_at: "2026-10-28T17:00:00Z", clock_running: true, overdue: false, overdue_by_minutes: 0 },
  can_reopen: false,
  reopen_until: null,
  match_score: null,
  events: [{ id: 1, at: "2026-10-28T13:00:00Z", kind: "created", actor: person, text: "Chamado aberto.", meta: {} }],
};

const reply = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });
const unavailable = (retryAfter = "2") =>
  reply({ error: { code: "legacy_unavailable", message: "fora do ar" } }, { status: 503, headers: { "Retry-After": retryAfter } });

function setup(...steps: Array<Response | Error>) {
  const queue = [...steps];
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const fakeFetch = vi.fn(async (input: URL | string, init?: RequestInit) => {
    calls.push({ url: new URL(String(input)), init: init ?? {} });
    const step = queue.shift();
    if (step === undefined) throw new Error("unexpected extra request");
    if (step instanceof Error) throw step;
    return step;
  });
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
  const client = new ServiceDeskClient({
    baseUrl: "http://sd.test",
    apiKey: "secret-key",
    fetch: fakeFetch as unknown as typeof fetch,
    sleep,
    random: () => 1,
  });
  return { client, calls, sleep, fakeFetch };
}

const header = (call: { init: RequestInit } | undefined, name: string) =>
  (call?.init.headers as Record<string, string> | undefined)?.[name];

describe("ServiceDeskClient", () => {
  it("sends the key and the actor, and camelizes what comes back", async () => {
    const { client, calls } = setup(reply({ items: [ticketJson], total: 1 }));

    const list = await client.listTickets(ana, { status: "all", q: "vpn", limit: 5 });

    expect(list.items[0]?.sla.dueAt).toBe("2026-10-28T17:00:00Z");
    expect(list.items[0]?.assignedGroup).toBeNull();
    expect(calls[0]?.url.pathname).toBe("/v1/tickets");
    expect(calls[0]?.url.searchParams.get("status")).toBe("all");
    expect(calls[0]?.url.searchParams.get("limit")).toBe("5");
    expect(header(calls[0], "X-API-Key")).toBe("secret-key");
    expect(header(calls[0], "X-Actor-Email")).toBe(ana);
  });

  it("retries a read through 503s, waiting at least what Retry-After asks", async () => {
    const { client, sleep, fakeFetch } = setup(unavailable(), unavailable(), reply({ items: [], total: 0 }));

    await expect(client.listTickets(ana)).resolves.toEqual({ items: [], total: 0 });

    expect(fakeFetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([2000, 2000]);
  });

  it("retries network failures and timeouts", async () => {
    const { client, fakeFetch } = setup(new TypeError("fetch failed"), new DOMException("timeout", "TimeoutError"), reply({ items: [], total: 0 }));
    await client.listTickets(ana);
    expect(fakeFetch).toHaveBeenCalledTimes(3);
  });

  it("gives up after the last attempt with an unavailable error", async () => {
    const { client, fakeFetch } = setup(unavailable(), unavailable(), unavailable(), unavailable());

    const failure = client.listTickets(ana);

    await expect(failure).rejects.toBeInstanceOf(ServiceDeskUnavailableError);
    await expect(failure).rejects.toMatchObject({ code: "legacy_unavailable", status: 503 });
    expect(fakeFetch).toHaveBeenCalledTimes(4);
  });

  it("reuses the same idempotency key and body on every retry of a write", async () => {
    const { client, calls } = setup(unavailable(), reply(ticketJson, { status: 201 }));

    const ticket = await client.createTicket(
      ana,
      { title: ticketJson.title, description: ticketJson.description, type: "INC", category: "rede_vpn", priority: "alta", affected: "me" },
      "draft-381",
    );

    expect(ticket.id).toBe("INC-20520");
    expect(calls).toHaveLength(2);
    expect(header(calls[0], "Idempotency-Key")).toBe("draft-381");
    expect(header(calls[1], "Idempotency-Key")).toBe("draft-381");
    expect(calls[1]?.init.body).toBe(calls[0]?.init.body);
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({ category: "rede_vpn", affected: "me" });
  });

  it("converts request keys to the legacy snake_case", async () => {
    const { client, calls } = setup(reply(ticketJson));
    await client.transferTicket(ana, "INC-20520", { toGroup: "N2", reason: "overdue", summary: "Chamado vencido há dias." }, "k1");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ to_group: "N2", reason: "overdue", summary: "Chamado vencido há dias." });
  });

  it("does not retry business errors", async () => {
    const { client, fakeFetch } = setup(
      reply({ error: { code: "reopen_window_expired", message: "Passou de 7 dias." } }, { status: 409 }),
    );

    await expect(client.reopenTicket(ana, "INC-19877", "Voltou.", "k2")).rejects.toMatchObject({
      name: "ServiceDeskApiError",
      code: "reopen_window_expired",
      status: 409,
    });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("answers null when a ticket is not visible to the person asking", async () => {
    const { client } = setup(reply({ error: { code: "ticket_not_found", message: "Chamado não encontrado." } }, { status: 404 }));
    await expect(client.getTicket(ana, "INC-20150")).resolves.toBeNull();
  });

  it("answers null for an unknown e-mail in the directory", async () => {
    const { client, calls } = setup(reply({ error: { code: "user_not_found", message: "Funcionário não encontrado." } }, { status: 404 }));
    await expect(client.getUser("quem@nexo.com.br")).resolves.toBeNull();
    expect(calls[0]?.url.pathname).toBe("/v1/directory/quem%40nexo.com.br");
  });

  it("rejects a response that breaks the contract", async () => {
    const { client } = setup(reply({ items: [{ id: "INC-1" }], total: 1 }));
    await expect(client.listTickets(ana)).rejects.toBeInstanceOf(ServiceDeskContractError);
  });

  it("turns an unparseable error body into a generic API error", async () => {
    const { client } = setup(new Response("<html>boom</html>", { status: 500 }));
    await expect(client.getMeta()).rejects.toBeInstanceOf(ServiceDeskApiError);
  });
});
