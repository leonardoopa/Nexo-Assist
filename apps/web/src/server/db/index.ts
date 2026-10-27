import "server-only";

import { seedDemoConversations } from "@/server/demo/seed";
import { getEnv } from "@/server/env";

import { openDatabase } from "./open";
import type { Db } from "./types";

// One connection per process, kept on globalThis so dev-mode hot reloads do not open another.
const shared = globalThis as unknown as { __nexoDb?: Db };

export function getDb(): Db {
  if (!shared.__nexoDb) {
    const env = getEnv();
    const db = openDatabase(env.DATABASE_PATH);
    if (env.DEMO_DATA) seedDemoConversations(db, { now: new Date(), messageLimit: env.CHAT_MESSAGE_LIMIT });
    shared.__nexoDb = db;
  }
  return shared.__nexoDb;
}

export type { Db } from "./types";
