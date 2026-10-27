import "server-only";

import type { z } from "zod";

import { camelizeKeys, snakeizeKeys } from "@/lib/case";
import type { SupportGroup } from "@/lib/domain";

import { ServiceDeskApiError, ServiceDeskContractError, ServiceDeskUnavailableError, isNotFound } from "./errors";
import { RETRYABLE_STATUS, backoffDelay, defaultRetryPolicy, parseRetryAfter, type RetryPolicy } from "./retry";
import {
  articleListSchema,
  errorEnvelopeSchema,
  metaSchema,
  slaPreviewSchema,
  ticketDetailSchema,
  ticketListSchema,
  userSchema,
  type Affected,
  type ArticleList,
  type Category,
  type Priority,
  type ServiceDeskMeta,
  type ServiceDeskUser,
  type SlaPreview,
  type TicketDetail,
  type TicketList,
  type TicketType,
  type TransferReason,
} from "./schemas";

export interface NewTicketInput {
  title: string;
  description: string;
  type: TicketType;
  category: Category;
  subcategory?: string;
  priority: Priority;
  affected: Affected;
}

export interface ListTicketsQuery {
  status?: "open" | "closed" | "all";
  q?: string;
  category?: Category;
  /** Analysts only: employees always get their own tickets. */
  requester?: string;
  limit?: number;
}

export interface TransferInput {
  toGroup: SupportGroup;
  reason: TransferReason;
  summary: string;
}

export interface ServiceDeskClientOptions {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  retry?: Partial<RetryPolicy>;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

interface RequestSpec {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string | number | undefined>;
  /** E-mail of the person the call is made for; the service enforces what that person may see. */
  actor?: string;
  body?: unknown;
  idempotencyKey?: string;
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function apiError(status: number, json: unknown): ServiceDeskApiError {
  const envelope = errorEnvelopeSchema.safeParse(json);
  return envelope.success
    ? new ServiceDeskApiError(envelope.data.error.message, envelope.data.error.code, status)
    : new ServiceDeskApiError(`O service desk respondeu HTTP ${status}.`, "http_error", status);
}

/**
 * Typed client for the legacy service desk. It is the anti-corruption layer between that system
 * (snake_case, flaky) and the app: every response is validated, and instability is absorbed here.
 *
 * Reads are retried. Writes always carry an idempotency key, so they are retried too without
 * ever creating a duplicate.
 */
export class ServiceDeskClient {
  readonly #baseUrl: string;
  readonly #apiKey: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #policy: RetryPolicy;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #random: () => number;

  constructor(options: ServiceDeskClientOptions) {
    this.#baseUrl = options.baseUrl;
    this.#apiKey = options.apiKey;
    this.#fetch = options.fetch ?? fetch;
    this.#timeoutMs = options.timeoutMs ?? 4000;
    this.#policy = { ...defaultRetryPolicy, ...options.retry };
    this.#sleep = options.sleep ?? pause;
    this.#random = options.random ?? Math.random;
  }

  // ---- directory and reference data ----------------------------------------------------------

  async getUser(email: string): Promise<ServiceDeskUser | null> {
    try {
      return await this.#request(userSchema, { method: "GET", path: `/v1/directory/${encodeURIComponent(email)}` });
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  getMeta(): Promise<ServiceDeskMeta> {
    return this.#request(metaSchema, { method: "GET", path: "/v1/meta" });
  }

  getSla(priority: Priority): Promise<SlaPreview> {
    return this.#request(slaPreviewSchema, { method: "GET", path: `/v1/sla/${priority}` });
  }

  searchArticles(query: string, limit = 5): Promise<ArticleList> {
    return this.#request(articleListSchema, { method: "GET", path: "/v1/articles", query: { q: query, limit } });
  }

  // ---- tickets: reads --------------------------------------------------------------------------

  listTickets(actor: string, query: ListTicketsQuery = {}): Promise<TicketList> {
    return this.#request(ticketListSchema, { method: "GET", path: "/v1/tickets", actor, query: { ...query } });
  }

  /** `null` when the ticket does not exist or belongs to someone else (the service does not tell them apart). */
  async getTicket(actor: string, ticketId: string): Promise<TicketDetail | null> {
    try {
      return await this.#request(ticketDetailSchema, { method: "GET", path: ticketPath(ticketId), actor });
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  // ---- tickets: writes (an idempotency key is mandatory) ----------------------------------------

  createTicket(actor: string, input: NewTicketInput, idempotencyKey: string): Promise<TicketDetail> {
    return this.#write(actor, "/v1/tickets", input, idempotencyKey);
  }

  addUpdate(actor: string, ticketId: string, text: string, idempotencyKey: string): Promise<TicketDetail> {
    return this.#write(actor, `${ticketPath(ticketId)}/updates`, { text }, idempotencyKey);
  }

  transferTicket(actor: string, ticketId: string, input: TransferInput, idempotencyKey: string): Promise<TicketDetail> {
    return this.#write(actor, `${ticketPath(ticketId)}/transfer`, input, idempotencyKey);
  }

  reopenTicket(actor: string, ticketId: string, reason: string, idempotencyKey: string): Promise<TicketDetail> {
    return this.#write(actor, `${ticketPath(ticketId)}/reopen`, { reason }, idempotencyKey);
  }

  // ---- tickets: analyst actions ----------------------------------------------------------------

  assumeTicket(actor: string, ticketId: string, idempotencyKey: string): Promise<TicketDetail> {
    return this.#write(actor, `${ticketPath(ticketId)}/assume`, undefined, idempotencyKey);
  }

  respondToTicket(actor: string, ticketId: string, text: string, idempotencyKey: string): Promise<TicketDetail> {
    return this.#write(actor, `${ticketPath(ticketId)}/respond`, { text }, idempotencyKey);
  }

  resolveTicket(actor: string, ticketId: string, resolution: string, idempotencyKey: string): Promise<TicketDetail> {
    return this.#write(actor, `${ticketPath(ticketId)}/resolve`, { resolution }, idempotencyKey);
  }

  // ---- plumbing --------------------------------------------------------------------------------

  #write(actor: string, path: string, body: unknown, idempotencyKey: string): Promise<TicketDetail> {
    return this.#request(ticketDetailSchema, { method: "POST", path, actor, body, idempotencyKey });
  }

  async #request<S extends z.ZodType>(schema: S, spec: RequestSpec): Promise<z.output<S>> {
    const response = await this.#send(spec);
    const text = await response.text();
    const json = text ? parseJson(text) : undefined;
    if (!response.ok) throw apiError(response.status, json);

    const parsed = schema.safeParse(camelizeKeys(json));
    if (!parsed.success) {
      throw new ServiceDeskContractError(
        `Resposta inesperada do service desk em ${spec.method} ${spec.path}: ${parsed.error.message}`,
        "contract_violation",
        response.status,
      );
    }
    return parsed.data;
  }

  /** Sends the request, retrying what is safe to retry, and returns the first answer worth reading. */
  async #send(spec: RequestSpec): Promise<Response> {
    const url = new URL(spec.path, this.#baseUrl);
    for (const [key, value] of Object.entries(spec.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const headers: Record<string, string> = { Accept: "application/json", "X-API-Key": this.#apiKey };
    if (spec.actor) headers["X-Actor-Email"] = spec.actor;
    if (spec.body !== undefined) headers["Content-Type"] = "application/json";
    if (spec.idempotencyKey) headers["Idempotency-Key"] = spec.idempotencyKey;
    const body = spec.body === undefined ? undefined : JSON.stringify(snakeizeKeys(spec.body));
    const retryable = spec.method === "GET" || spec.idempotencyKey !== undefined;

    for (let attempt = 1; ; attempt++) {
      const lastAttempt = !retryable || attempt >= this.#policy.maxAttempts;
      let response: Response;
      try {
        response = await this.#fetch(url, {
          method: spec.method,
          headers,
          body,
          cache: "no-store",
          signal: AbortSignal.timeout(this.#timeoutMs),
        });
      } catch (cause) {
        if (lastAttempt) {
          throw new ServiceDeskUnavailableError(
            "Não foi possível falar com o sistema de chamados.",
            "legacy_unreachable",
            null,
            { cause },
          );
        }
        await this.#sleep(backoffDelay(attempt, this.#policy, this.#random));
        continue;
      }

      if (!RETRYABLE_STATUS.has(response.status)) return response;
      if (lastAttempt) {
        throw new ServiceDeskUnavailableError(
          "O sistema de chamados está indisponível no momento.",
          "legacy_unavailable",
          response.status,
        );
      }
      const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
      await response.body?.cancel();
      await this.#sleep(backoffDelay(attempt, this.#policy, this.#random, retryAfter));
    }
  }
}

const ticketPath = (ticketId: string) => `/v1/tickets/${encodeURIComponent(ticketId)}`;
