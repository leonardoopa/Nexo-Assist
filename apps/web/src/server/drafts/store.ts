import { z } from "zod";

import type { Db } from "@/server/db/types";
import type { DraftStatus } from "@/server/conversations/types";
import { affectedSchema, categorySchema, prioritySchema, ticketTypeSchema } from "@/server/servicedesk/schemas";

export const createPayloadSchema = z.object({
  title: z.string(),
  description: z.string(),
  type: ticketTypeSchema,
  category: categorySchema,
  subcategory: z.string().nullable(),
  priority: prioritySchema,
  affected: affectedSchema,
  slaLabel: z.string(),
  dueAt: z.string().nullable(),
  /** Open tickets that look alike but were not clear enough to block the draft. */
  similar: z.array(z.object({ id: z.string(), title: z.string() })),
});
export const updatePayloadSchema = z.object({ ticketId: z.string(), text: z.string() });
export const reopenPayloadSchema = z.object({ ticketId: z.string(), reason: z.string() });

export type CreatePayload = z.infer<typeof createPayloadSchema>;
export type UpdatePayload = z.infer<typeof updatePayloadSchema>;
export type ReopenPayload = z.infer<typeof reopenPayloadSchema>;

export type DraftInput =
  | { kind: "ticket_create"; payload: CreatePayload }
  | { kind: "ticket_update"; payload: UpdatePayload }
  | { kind: "ticket_reopen"; payload: ReopenPayload };

export type Draft = DraftInput & {
  id: number;
  conversationId: string;
  status: DraftStatus;
  messageId: string | null;
  /** The target of an update or reopen, then, once confirmed, the ticket the action produced. */
  ticketId: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

interface DraftRow {
  id: number;
  conversation_id: string;
  kind: DraftInput["kind"];
  payload: string;
  status: DraftStatus;
  message_id: string | null;
  ticket_id: string | null;
  created_at: string;
  resolved_at: string | null;
}

/** How a draft is named on screen: D-381. */
export const draftLabel = (id: number): string => `D-${String(id).padStart(3, "0")}`;

function toDraft(row: DraftRow): Draft {
  const base = {
    id: row.id,
    conversationId: row.conversation_id,
    status: row.status,
    messageId: row.message_id,
    ticketId: row.ticket_id,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
  const raw: unknown = JSON.parse(row.payload);
  switch (row.kind) {
    case "ticket_create":
      return { ...base, kind: row.kind, payload: createPayloadSchema.parse(raw) };
    case "ticket_update":
      return { ...base, kind: row.kind, payload: updatePayloadSchema.parse(raw) };
    case "ticket_reopen":
      return { ...base, kind: row.kind, payload: reopenPayloadSchema.parse(raw) };
  }
}

/** Drafts are the "show before you act" step: the agent prepares them, only the employee confirms. */
export class DraftStore {
  readonly #db: Db;
  readonly #now: () => string;

  constructor(db: Db, now: () => Date = () => new Date()) {
    this.#db = db;
    this.#now = () => now().toISOString();
  }

  create(conversationId: string, input: DraftInput): Draft {
    const ticketId = input.kind === "ticket_create" ? null : input.payload.ticketId;
    const result = this.#db
      .prepare(
        `INSERT INTO drafts (conversation_id, kind, payload, status, ticket_id, created_at)
         VALUES (?, ?, ?, 'pending', ?, ?)`,
      )
      .run(conversationId, input.kind, JSON.stringify(input.payload), ticketId, this.#now());
    return this.#require(Number(result.lastInsertRowid));
  }

  get(id: number): Draft | null {
    const row = this.#db.prepare("SELECT * FROM drafts WHERE id = ?").get(id) as DraftRow | undefined;
    return row ? toDraft(row) : null;
  }

  /** The draft waiting for the employee, if any. A new draft replaces the old one, so there is at most one. */
  pending(conversationId: string): Draft | null {
    const row = this.#db
      .prepare("SELECT * FROM drafts WHERE conversation_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1")
      .get(conversationId) as DraftRow | undefined;
    return row ? toDraft(row) : null;
  }

  attachMessage(id: number, messageId: string): void {
    this.#db.prepare("UPDATE drafts SET message_id = ? WHERE id = ?").run(messageId, id);
  }

  resolve(id: number, status: "confirmed" | "cancelled", ticketId?: string): Draft {
    this.#db
      .prepare("UPDATE drafts SET status = ?, resolved_at = ?, ticket_id = COALESCE(?, ticket_id) WHERE id = ? AND status = 'pending'")
      .run(status, this.#now(), ticketId ?? null, id);
    return this.#require(id);
  }

  /** Marks every pending draft of the conversation as replaced and returns them. */
  supersedePending(conversationId: string): Draft[] {
    return this.#db.transaction(() => {
      const rows = this.#db
        .prepare("SELECT * FROM drafts WHERE conversation_id = ? AND status = 'pending'")
        .all(conversationId) as DraftRow[];
      this.#db
        .prepare("UPDATE drafts SET status = 'superseded', resolved_at = ? WHERE conversation_id = ? AND status = 'pending'")
        .run(this.#now(), conversationId);
      return rows.map((row) => toDraft({ ...row, status: "superseded" }));
    })();
  }

  #require(id: number): Draft {
    const draft = this.get(id);
    if (!draft) throw new Error(`Rascunho ${id} não encontrado.`);
    return draft;
  }
}
