import "server-only";

import { DecisionStore } from "@/server/agent/decision-store";
import { getConversations } from "@/server/conversations";
import { getDb } from "@/server/db";
import { DraftStore } from "@/server/drafts/store";

import type { ChatDeps } from "./load";

/** What the chat page needs to read a conversation, without loading the agent itself. */
export function getChatDeps(): ChatDeps {
  const db = getDb();
  return { conversations: getConversations(), decisions: new DecisionStore(db), drafts: new DraftStore(db) };
}
