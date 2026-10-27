import { SLA_LABEL } from "@/lib/labels";
import { wordSet } from "@/server/agent/policy/text";
import { ServiceDeskApiError } from "@/server/servicedesk/errors";
import type { NewTicketInput, TransferInput } from "@/server/servicedesk/client";
import type { ServiceDeskPort } from "@/server/servicedesk/port";
import type { Priority, ServiceDeskUser, Ticket, TicketDetail, TicketList } from "@/server/servicedesk/schemas";

import { ANA, ANA_TICKETS, ARTICLES, CARLA, CARLA_TICKETS, MARINA, NOW, RAFAEL, ticket } from "./fixtures";

const USERS: Record<string, ServiceDeskUser> = {
  [ANA.email]: { ...ANA, role: "employee", device: { model: "Dell Latitude 5440", os: "Windows 11" }, passwordChangedAt: null },
  [CARLA.email]: { ...CARLA, role: "employee", device: { model: "Lenovo ThinkPad T14", os: "Windows 11" }, passwordChangedAt: null },
  [RAFAEL.email]: { ...RAFAEL, role: "analyst", device: null, passwordChangedAt: null },
  [MARINA.email]: { ...MARINA, role: "analyst", device: null, passwordChangedAt: null },
};

const SLA_HOURS: Record<Priority, number> = { critica: 1, alta: 4, media: 72, baixa: 120 };

/**
 * An in-memory service desk with the same rules the real one enforces where the agent and the
 * console depend on them (employees only see their own tickets, analysts see everyone's, writes
 * are idempotent), plus a call log and failure injection.
 */
export class FakeServiceDesk implements ServiceDeskPort {
  readonly tickets: TicketDetail[];
  readonly calls: Array<{ method: string; args: unknown[] }> = [];
  readonly created: string[] = [];
  readonly #failures = new Map<string, Error[]>();
  readonly #replays = new Map<string, TicketDetail>();
  #nextIncident = 20520;
  #nextRequest = 10443;

  constructor(tickets: Ticket[] = [...ANA_TICKETS, ...CARLA_TICKETS]) {
    this.tickets = tickets.map((entry) => ({ ...entry, events: [] }));
  }

  /** Makes the next `times` calls of `method` throw `error`. */
  failNext(method: keyof ServiceDeskPort, error: Error, times = 1): void {
    this.#failures.set(method, Array(times).fill(error));
  }

  callsOf(method: keyof ServiceDeskPort) {
    return this.calls.filter((entry) => entry.method === method);
  }

  #enter(method: string, args: unknown[]): void {
    this.calls.push({ method, args });
    const error = this.#failures.get(method)?.shift();
    if (error) throw error;
  }

  #own(actor: string, id: string): TicketDetail | null {
    return this.tickets.find((entry) => entry.id === id && entry.requester.email === actor) ?? null;
  }

  #isAnalyst(actor: string): boolean {
    return USERS[actor]?.role === "analyst";
  }

  /** What `actor` may open: analysts any ticket, employees their own. */
  #visible(actor: string, id: string): TicketDetail | null {
    return this.#isAnalyst(actor) ? (this.tickets.find((entry) => entry.id === id) ?? null) : this.#own(actor, id);
  }

  #once(actor: string, key: string, work: () => TicketDetail): TicketDetail {
    const replay = this.#replays.get(`${actor}:${key}`);
    if (replay) return replay;
    const result = work();
    this.#replays.set(`${actor}:${key}`, result);
    return result;
  }

  async getUser(email: string): Promise<ServiceDeskUser | null> {
    this.#enter("getUser", [email]);
    return USERS[email] ?? null;
  }

  async listTickets(
    actor: string,
    query: { status?: "open" | "closed" | "all"; q?: string; requester?: string; limit?: number } = {},
  ): Promise<TicketList> {
    this.#enter("listTickets", [actor, query]);
    const status = query.status ?? "open";
    const analyst = this.#isAnalyst(actor);
    let items: Ticket[] = this.tickets.filter(
      (entry) =>
        (analyst ? query.requester === undefined || entry.requester.email === query.requester : entry.requester.email === actor) &&
        (status === "all" || (status === "open" ? entry.status !== "resolvido" : entry.status === "resolvido")),
    );
    if (query.q) {
      const words = wordSet(query.q);
      items = items
        .map((entry) => {
          const known = wordSet(`${entry.title} ${entry.subcategory ?? ""} ${entry.description}`);
          return { entry, score: [...words].filter((word) => known.has(word)).length / Math.max(words.size, 1) };
        })
        .filter((scored) => scored.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((scored) => ({ ...scored.entry, matchScore: Math.round(scored.score * 100) / 100 }));
    }
    return { items: items.slice(0, query.limit ?? 20), total: items.length };
  }

  async getTicket(actor: string, ticketId: string): Promise<TicketDetail | null> {
    this.#enter("getTicket", [actor, ticketId]);
    return this.#visible(actor, ticketId);
  }

  async getSla(priority: Priority) {
    this.#enter("getSla", [priority]);
    return {
      priority,
      label: SLA_LABEL[priority],
      businessHours: priority !== "critica",
      dueAt: new Date(NOW.getTime() + SLA_HOURS[priority] * 3_600_000).toISOString(),
      calculatedFrom: NOW.toISOString(),
    };
  }

  async searchArticles(query: string, limit = 5) {
    this.#enter("searchArticles", [query, limit]);
    const words = wordSet(query);
    const items = ARTICLES.map((article) => {
      const known = wordSet(`${article.title} ${article.tags.join(" ")} ${article.body}`);
      const shared = [...words].filter((word) => known.has(word)).length;
      return { ...article, score: words.size ? Math.round(Math.min(1, shared / words.size) * 100) / 100 : 0 };
    })
      .filter((article) => article.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return { items };
  }

  async createTicket(actor: string, input: NewTicketInput, idempotencyKey: string): Promise<TicketDetail> {
    this.#enter("createTicket", [actor, input, idempotencyKey]);
    return this.#once(actor, idempotencyKey, () => {
      const id = input.type === "INC" ? `INC-${this.#nextIncident++}` : `REQ-${this.#nextRequest++}`;
      const requester = USERS[actor] ?? ANA;
      const created: TicketDetail = {
        ...ticket({
          id,
          title: input.title,
          description: input.description,
          category: input.category,
          subcategory: input.subcategory ?? null,
          priority: input.priority,
          affected: input.affected,
          requester,
          createdAt: NOW.toISOString(),
          updatedAt: NOW.toISOString(),
          lastResponseAt: NOW.toISOString(),
          sla: {
            label: SLA_LABEL[input.priority],
            dueAt: new Date(NOW.getTime() + SLA_HOURS[input.priority] * 3_600_000).toISOString(),
            clockRunning: true,
            overdue: false,
            overdueByMinutes: 0,
          },
        }),
        events: [{ id: 1, at: NOW.toISOString(), kind: "created", actor: requester, text: "Chamado aberto.", meta: {} }],
      };
      this.tickets.push(created);
      this.created.push(id);
      return created;
    });
  }

  async addUpdate(actor: string, ticketId: string, text: string, idempotencyKey: string): Promise<TicketDetail> {
    this.#enter("addUpdate", [actor, ticketId, text, idempotencyKey]);
    return this.#once(actor, idempotencyKey, () => {
      const found = this.#own(actor, ticketId);
      if (!found) throw new ServiceDeskApiError("Chamado não encontrado.", "ticket_not_found", 404);
      if (found.status === "resolvido") throw new ServiceDeskApiError("O chamado já foi resolvido.", "ticket_resolved", 409);
      found.events.push({ id: found.events.length + 1, at: NOW.toISOString(), kind: "employee_update", actor: found.requester, text, meta: {} });
      return found;
    });
  }

  async transferTicket(actor: string, ticketId: string, input: TransferInput, idempotencyKey: string): Promise<TicketDetail> {
    this.#enter("transferTicket", [actor, ticketId, input, idempotencyKey]);
    return this.#once(actor, idempotencyKey, () => {
      const found = this.#own(actor, ticketId);
      if (!found) throw new ServiceDeskApiError("Chamado não encontrado.", "ticket_not_found", 404);
      found.status = "aguardando_analista";
      found.assignedGroup = input.toGroup;
      found.events.push({ id: found.events.length + 1, at: NOW.toISOString(), kind: "transferred", actor: found.requester, text: input.summary, meta: { reason: input.reason } });
      return found;
    });
  }

  async reopenTicket(actor: string, ticketId: string, reason: string, idempotencyKey: string): Promise<TicketDetail> {
    this.#enter("reopenTicket", [actor, ticketId, reason, idempotencyKey]);
    return this.#once(actor, idempotencyKey, () => {
      const found = this.#own(actor, ticketId);
      if (!found) throw new ServiceDeskApiError("Chamado não encontrado.", "ticket_not_found", 404);
      if (found.status !== "resolvido") throw new ServiceDeskApiError("Só chamados resolvidos podem ser reabertos.", "ticket_not_resolved", 409);
      if (!found.canReopen) throw new ServiceDeskApiError("Passou de 7 dias.", "reopen_window_expired", 409);
      found.status = "aberto";
      found.resolvedAt = null;
      found.canReopen = false;
      found.events.push({ id: found.events.length + 1, at: NOW.toISOString(), kind: "reopened", actor: found.requester, text: reason, meta: {} });
      return found;
    });
  }

  async assumeTicket(actor: string, ticketId: string, idempotencyKey: string): Promise<TicketDetail> {
    this.#enter("assumeTicket", [actor, ticketId, idempotencyKey]);
    return this.#once(actor, idempotencyKey, () => {
      const analyst = USERS[actor];
      if (analyst?.role !== "analyst") throw new ServiceDeskApiError("Apenas analistas podem assumir chamados.", "forbidden", 403);
      const found = this.#visible(actor, ticketId);
      if (!found) throw new ServiceDeskApiError("Chamado não encontrado.", "ticket_not_found", 404);
      if (found.status === "resolvido") throw new ServiceDeskApiError("O chamado já foi resolvido.", "ticket_resolved", 409);
      found.status = "em_atendimento";
      found.assignee = analyst;
      found.assignedGroup = analyst.supportGroup;
      found.lastResponseAt = NOW.toISOString();
      found.events.push({
        id: found.events.length + 1,
        at: NOW.toISOString(),
        kind: "assumed",
        actor: analyst,
        text: `${analyst.name} assumiu o atendimento.`,
        meta: {},
      });
      return found;
    });
  }
}
