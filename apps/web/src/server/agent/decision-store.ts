import type { Db } from "@/server/db/types";

import { decisionRecordSchema, type DecisionRecord } from "./decision";

interface DecisionRow {
  message_id: string;
  data: string;
}

/** One decision record per assistant message, kept so the history can always explain itself. */
export class DecisionStore {
  readonly #db: Db;
  readonly #now: () => string;

  constructor(db: Db, now: () => Date = () => new Date()) {
    this.#db = db;
    this.#now = () => now().toISOString();
  }

  save(input: { id: string; conversationId: string; messageId: string; decision: DecisionRecord }): void {
    const { decision } = input;
    this.#db
      .prepare(
        `INSERT INTO agent_decisions
           (id, conversation_id, message_id, intent, confidence, model, latency_ms, input_tokens, output_tokens, data, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.conversationId,
        input.messageId,
        decision.intent,
        decision.confidence.score,
        decision.usage?.model ?? null,
        decision.usage?.latencyMs ?? null,
        decision.usage?.inputTokens ?? null,
        decision.usage?.outputTokens ?? null,
        JSON.stringify(decision),
        this.#now(),
      );
  }

  get(messageId: string): DecisionRecord | null {
    const row = this.#db.prepare("SELECT message_id, data FROM agent_decisions WHERE message_id = ?").get(messageId) as
      | DecisionRow
      | undefined;
    return row ? decisionRecordSchema.parse(JSON.parse(row.data)) : null;
  }

  /** Decisions of a conversation keyed by the message they explain. */
  forConversation(conversationId: string): Map<string, DecisionRecord> {
    const rows = this.#db
      .prepare("SELECT message_id, data FROM agent_decisions WHERE conversation_id = ? ORDER BY created_at")
      .all(conversationId) as DecisionRow[];
    return new Map(rows.map((row) => [row.message_id, decisionRecordSchema.parse(JSON.parse(row.data))]));
  }

  /** The most recent decision of the conversation, to see whether the agent has been unsure twice in a row. */
  latest(conversationId: string): DecisionRecord | null {
    const row = this.#db
      .prepare("SELECT message_id, data FROM agent_decisions WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
      .get(conversationId) as DecisionRow | undefined;
    return row ? decisionRecordSchema.parse(JSON.parse(row.data)) : null;
  }
}
