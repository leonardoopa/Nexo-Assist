import "server-only";

import { getDb } from "@/server/db";
import { getEnv } from "@/server/env";

import { ConversationStore } from "./store";

const shared = globalThis as unknown as { __nexoConversations?: ConversationStore };

export function getConversations(): ConversationStore {
  shared.__nexoConversations ??= new ConversationStore(getDb(), { messageLimit: getEnv().CHAT_MESSAGE_LIMIT });
  return shared.__nexoConversations;
}

export { ConversationError } from "./errors";
export type * from "./types";
