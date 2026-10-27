import "server-only";

import { DecisionStore } from "@/server/agent/decision-store";
import { getConversations } from "@/server/conversations";
import { getDb } from "@/server/db";
import { getServiceDesk } from "@/server/servicedesk";

import type { ConsoleDeps } from "./load";

export function getConsoleDeps(): ConsoleDeps {
  return { conversations: getConversations(), decisions: new DecisionStore(getDb()), serviceDesk: getServiceDesk() };
}
