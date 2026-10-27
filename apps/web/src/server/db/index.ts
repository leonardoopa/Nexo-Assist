import "server-only";

import { getEnv } from "@/server/env";

import { openDatabase } from "./open";
import type { Db } from "./types";

// One connection per process, kept on globalThis so dev-mode hot reloads do not open another.
const shared = globalThis as unknown as { __nexoDb?: Db };

export function getDb(): Db {
  shared.__nexoDb ??= openDatabase(getEnv().DATABASE_PATH);
  return shared.__nexoDb;
}

export type { Db } from "./types";
