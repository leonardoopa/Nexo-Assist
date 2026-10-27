import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { SupportGroup } from "@/lib/domain";
import type { Db } from "@/server/db/types";

import { ConversationError } from "./errors";
import { agentMayReply, countsTowardLimit, transition } from "./state";
import {
  messagePartSchema,
  type AnalystRef,
  type AppendMessageInput,
  type ClosedBy,
  type ConsoleQuery,
  type ConsoleTab,
  type Conversation,
  type ConversationStatus,
  type EmployeeRef,
  type HandoffInput,
  type HandoffReason,
  type Message,
  type MessagePart,
  type MessageRole,
} from "./types";

interface ConversationRow {
  id: string;
  employee_email: string;
  employee_name: string;
  department: string | null;
  status: ConversationStatus;
  handoff_reason: HandoffReason | null;
  handoff_summary: string | null;
  handoff_group: SupportGroup | null;
  handoff_at: string | null;
  handoff_respond_by: string | null;
  assignee_email: string | null;
  assignee_name: string | null;
  message_count: number;
  analyst_unread: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_role: Exclude<MessageRole, "system"> | null;
  closed_at: string | null;
  closed_by: ClosedBy | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  seq: number;
  role: MessageRole;
  author_email: string | null;
  author_name: string | null;
  content: string;
  parts: string;
  created_at: string;
}

const partsSchema = z.array(messagePartSchema);

function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    employee: { email: row.employee_email, name: row.employee_name, department: row.department },
    status: row.status,
    handoff:
      row.handoff_reason && row.handoff_group && row.handoff_summary && row.handoff_at
        ? {
            reason: row.handoff_reason,
            group: row.handoff_group,
            summary: row.handoff_summary,
            at: row.handoff_at,
            respondBy: row.handoff_respond_by,
          }
        : null,
    assignee: row.assignee_email && row.assignee_name ? { email: row.assignee_email, name: row.assignee_name } : null,
    messageCount: row.message_count,
    analystUnread: row.analyst_unread,
    lastMessage: row.last_message_at
      ? { at: row.last_message_at, preview: row.last_message_preview ?? "", role: row.last_message_role ?? "user" }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
    closedBy: row.closed_by,
  };
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    seq: row.seq,
    role: row.role,
    author: row.author_email && row.author_name ? { email: row.author_email, name: row.author_name } : null,
    content: row.content,
    parts: partsSchema.parse(JSON.parse(row.parts)),
    createdAt: row.created_at,
  };
}

const previewOf = (content: string) => content.replace(/\s+/g, " ").trim().slice(0, 140);
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "SQLITE_CONSTRAINT_UNIQUE";
}

export interface StoreOptions {
  /** Messages (employee + assistant) a conversation may hold before the employee must start a new one. */
  messageLimit: number;
  now?: () => Date;
  newId?: () => string;
}

/**
 * Conversations and their messages. Every rule that must hold together (limit, who may speak,
 * state changes) runs inside one transaction, so concurrent requests cannot break an invariant.
 */
export class ConversationStore {
  readonly #db: Db;
  readonly #clock: () => Date;
  readonly #newId: () => string;
  readonly messageLimit: number;

  constructor(db: Db, options: StoreOptions) {
    this.#db = db;
    this.#clock = options.now ?? (() => new Date());
    this.#newId = options.newId ?? randomUUID;
    this.messageLimit = options.messageLimit;
  }

  // ---- reading -----------------------------------------------------------------------------------

  get(id: string): Conversation | null {
    const row = this.#db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as ConversationRow | undefined;
    return row ? toConversation(row) : null;
  }

  /** Ownership is part of the query: another employee's conversation simply does not exist for you. */
  getForEmployee(id: string, email: string): Conversation | null {
    const row = this.#db
      .prepare("SELECT * FROM conversations WHERE id = ? AND employee_email = ?")
      .get(id, email) as ConversationRow | undefined;
    return row ? toConversation(row) : null;
  }

  findOpen(email: string): Conversation | null {
    const row = this.#db
      .prepare("SELECT * FROM conversations WHERE employee_email = ? AND status != 'closed'")
      .get(email) as ConversationRow | undefined;
    return row ? toConversation(row) : null;
  }

  messages(conversationId: string): Message[] {
    const rows = this.#db
      .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY seq")
      .all(conversationId) as MessageRow[];
    return rows.map(toMessage);
  }

  // ---- starting ----------------------------------------------------------------------------------

  start(employee: EmployeeRef): Conversation {
    const id = this.#newId();
    const now = this.#now();
    try {
      this.#db
        .prepare(
          `INSERT INTO conversations (id, employee_email, employee_name, department, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'agent', ?, ?)`,
        )
        .run(id, employee.email, employee.name, employee.department, now, now);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConversationError("active_exists", "Já existe uma conversa aberta para este funcionário.");
      }
      throw error;
    }
    return this.#require(id);
  }

  /** Coming back another day continues the open conversation; a closed one is history and a new one begins. */
  resumeOrStart(employee: EmployeeRef): { conversation: Conversation; created: boolean } {
    return this.#db.transaction(() => {
      const open = this.findOpen(employee.email);
      return open ? { conversation: open, created: false } : { conversation: this.start(employee), created: true };
    })();
  }

  // ---- messages ----------------------------------------------------------------------------------

  appendMessage(conversationId: string, input: AppendMessageInput): { conversation: Conversation; message: Message } {
    return this.#db.transaction(() => {
      const conversation = this.#require(conversationId);
      this.#assertMayAppend(conversation, input);

      const message = this.#insertMessage(conversation.id, input);
      if (input.role === "system") {
        this.#db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(message.createdAt, conversation.id);
      } else {
        const waitingForPerson = conversation.status === "awaiting_analyst" || conversation.status === "with_analyst";
        this.#db
          .prepare(
            `UPDATE conversations SET
               message_count = message_count + ?,
               analyst_unread = analyst_unread + ?,
               last_message_at = ?, last_message_preview = ?, last_message_role = ?,
               updated_at = ?
             WHERE id = ?`,
          )
          .run(
            countsTowardLimit(input.role) ? 1 : 0,
            input.role === "user" && waitingForPerson ? 1 : 0,
            message.createdAt,
            previewOf(input.content),
            input.role,
            message.createdAt,
            conversation.id,
          );
      }
      return { conversation: this.#require(conversation.id), message };
    })();
  }

  // ---- handoff life cycle ------------------------------------------------------------------------

  handoff(conversationId: string, input: HandoffInput): Conversation {
    return this.#db.transaction(() => {
      const conversation = this.#require(conversationId);
      const status = transition(conversation.status, "handoff");
      const now = this.#now();
      this.#db
        .prepare(
          `UPDATE conversations SET status = ?, handoff_reason = ?, handoff_summary = ?, handoff_group = ?,
             handoff_at = ?, handoff_respond_by = ?, updated_at = ? WHERE id = ?`,
        )
        .run(status, input.reason, input.summary, input.group, now, input.respondBy ?? null, now, conversationId);
      this.#insertEvent(conversationId, `Transferida para Suporte ${input.group}`, {
        type: "event",
        kind: "handoff",
        data: { reason: input.reason, group: input.group, ...(input.respondBy ? { respondBy: input.respondBy } : {}) },
      });
      return this.#require(conversationId);
    })();
  }

  assume(conversationId: string, analyst: AnalystRef): Conversation {
    return this.#db.transaction(() => {
      const conversation = this.#require(conversationId);
      const status = transition(conversation.status, "assume");
      const now = this.#now();
      this.#db
        .prepare(
          `UPDATE conversations SET status = ?, assignee_email = ?, assignee_name = ?, assumed_at = ?,
             analyst_unread = 0, updated_at = ? WHERE id = ?`,
        )
        .run(status, analyst.email, analyst.name, now, now, conversationId);
      this.#insertEvent(conversationId, `${analyst.name} assumiu · agent pausado`, {
        type: "event",
        kind: "assumed",
        data: { analyst: analyst.name },
      });
      return this.#require(conversationId);
    })();
  }

  returnToAgent(conversationId: string, analyst: AnalystRef): Conversation {
    return this.#db.transaction(() => {
      const conversation = this.#require(conversationId);
      this.#assertAssignee(conversation, analyst);
      const status = transition(conversation.status, "return_to_agent");
      this.#db
        .prepare(
          `UPDATE conversations SET status = ?, assignee_email = NULL, assignee_name = NULL, assumed_at = NULL,
             handoff_reason = NULL, handoff_summary = NULL, handoff_group = NULL, handoff_at = NULL,
             handoff_respond_by = NULL, analyst_unread = 0, updated_at = ? WHERE id = ?`,
        )
        .run(status, this.#now(), conversationId);
      this.#insertEvent(conversationId, "Atendimento devolvido ao agent", {
        type: "event",
        kind: "returned_to_agent",
        data: { analyst: analyst.name },
      });
      return this.#require(conversationId);
    })();
  }

  /** The agent closes its own resolved conversations; an analyst closes the ones they hold. */
  close(conversationId: string, by: "agent"): Conversation;
  close(conversationId: string, by: "analyst", analyst: AnalystRef): Conversation;
  close(conversationId: string, by: ClosedBy, analyst?: AnalystRef): Conversation {
    return this.#db.transaction(() => {
      const conversation = this.#require(conversationId);
      if (by === "analyst") {
        if (!analyst) throw new ConversationError("not_assignee", "Informe o analista que encerra o atendimento.");
        this.#assertAssignee(conversation, analyst);
      }
      const status = transition(conversation.status, "close");
      const now = this.#now();
      this.#db
        .prepare("UPDATE conversations SET status = ?, closed_at = ?, closed_by = ?, updated_at = ? WHERE id = ?")
        .run(status, now, by, now, conversationId);
      this.#insertEvent(conversationId, "Atendimento encerrado", {
        type: "event",
        kind: "closed",
        data: { by, ...(analyst ? { analyst: analyst.name } : {}) },
      });
      return this.#require(conversationId);
    })();
  }

  markReadByAnalyst(conversationId: string): void {
    this.#db.prepare("UPDATE conversations SET analyst_unread = 0 WHERE id = ?").run(conversationId);
  }

  // ---- console -----------------------------------------------------------------------------------

  listForConsole({ tab, analystEmail, search, limit = 50 }: ConsoleQuery): Conversation[] {
    const where: string[] = [];
    const params: unknown[] = [];
    switch (tab) {
      case "for_you":
        where.push("status = 'awaiting_analyst'");
        break;
      case "agent":
        where.push("status = 'agent'");
        break;
      case "mine":
        where.push("status = 'with_analyst' AND assignee_email = ?");
        params.push(analystEmail);
        break;
      case "all":
        where.push("(status != 'closed' OR closed_at >= ?)");
        params.push(this.#recentCutoff());
        break;
    }
    if (search?.trim()) {
      const like = `%${escapeLike(search.trim())}%`;
      where.push("(employee_name LIKE ? ESCAPE '\\' OR employee_email LIKE ? ESCAPE '\\')");
      params.push(like, like);
    }
    const rows = this.#db
      .prepare(
        `SELECT * FROM conversations WHERE ${where.join(" AND ")}
         ORDER BY CASE status WHEN 'awaiting_analyst' THEN 0 WHEN 'with_analyst' THEN 1 WHEN 'agent' THEN 2 ELSE 3 END,
                  COALESCE(last_message_at, updated_at) DESC
         LIMIT ?`,
      )
      .all(...params, limit) as ConversationRow[];
    return rows.map(toConversation);
  }

  consoleCounts(analystEmail: string): Record<ConsoleTab, number> {
    const row = this.#db
      .prepare(
        `SELECT
           SUM(status = 'awaiting_analyst') AS for_you,
           SUM(status = 'agent') AS agent,
           SUM(status = 'with_analyst' AND assignee_email = ?) AS mine,
           SUM(status != 'closed' OR closed_at >= ?) AS everything
         FROM conversations`,
      )
      .get(analystEmail, this.#recentCutoff()) as {
      for_you: number | null;
      agent: number | null;
      mine: number | null;
      everything: number | null;
    };
    return { for_you: row.for_you ?? 0, agent: row.agent ?? 0, mine: row.mine ?? 0, all: row.everything ?? 0 };
  }

  // ---- internals ---------------------------------------------------------------------------------

  #now(): string {
    return this.#clock().toISOString();
  }

  /** Closed conversations stay in "all" for a week, like the recent history in the console. */
  #recentCutoff(): string {
    return new Date(this.#clock().getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  #require(id: string): Conversation {
    const conversation = this.get(id);
    if (!conversation) throw new ConversationError("not_found", "Conversa não encontrada.");
    return conversation;
  }

  #assertAssignee(conversation: Conversation, analyst: AnalystRef): void {
    if (conversation.assignee?.email !== analyst.email) {
      throw new ConversationError("not_assignee", "Só o analista que assumiu a conversa pode fazer isso.");
    }
  }

  #assertMayAppend(conversation: Conversation, input: AppendMessageInput): void {
    if (conversation.status === "closed") {
      throw new ConversationError("closed", "A conversa foi encerrada. Inicie uma nova.");
    }
    switch (input.role) {
      case "user":
        if (conversation.messageCount >= this.messageLimit) {
          throw new ConversationError(
            "limit_reached",
            `Esta sessão chegou ao limite de ${this.messageLimit} mensagens. Inicie uma nova conversa.`,
          );
        }
        break;
      case "assistant":
        if (!agentMayReply(conversation.status)) {
          throw new ConversationError("agent_paused", "O agent está pausado: a conversa está com um analista.");
        }
        break;
      case "analyst":
        if (conversation.status !== "with_analyst" || conversation.assignee?.email !== input.author?.email) {
          throw new ConversationError("not_assignee", "Só o analista que assumiu a conversa pode responder.");
        }
        break;
      case "system":
        break;
    }
  }

  #insertMessage(conversationId: string, input: AppendMessageInput): Message {
    const id = this.#newId();
    const createdAt = this.#now();
    const seq =
      (this.#db.prepare("SELECT COALESCE(MAX(seq), 0) FROM messages WHERE conversation_id = ?").pluck().get(conversationId) as number) + 1;
    const parts = input.parts ?? [];
    this.#db
      .prepare(
        `INSERT INTO messages (id, conversation_id, seq, role, author_email, author_name, content, parts, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        conversationId,
        seq,
        input.role,
        input.author?.email ?? null,
        input.author?.name ?? null,
        input.content,
        JSON.stringify(parts),
        createdAt,
      );
    return {
      id,
      conversationId,
      seq,
      role: input.role,
      author: input.author ?? null,
      content: input.content,
      parts,
      createdAt,
    };
  }

  #insertEvent(conversationId: string, content: string, part: MessagePart): void {
    this.#insertMessage(conversationId, { role: "system", content, parts: [part] });
  }
}
