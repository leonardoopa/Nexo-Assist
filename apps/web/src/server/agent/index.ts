import "server-only";

import { randomUUID } from "node:crypto";

import { getConversations } from "@/server/conversations";
import { getDb } from "@/server/db";
import { DraftStore } from "@/server/drafts/store";
import { getEnv } from "@/server/env";
import { getServiceDesk } from "@/server/servicedesk";

import { DecisionStore } from "./decision-store";
import { createAgentRuntime, type AgentModel, type AgentRuntime } from "./runtime";

const shared = globalThis as unknown as { __nexoAgent?: AgentRuntime };

/** The agent wired to the real database, service desk and the model chosen in LLM_MODEL. */
export function getAgentRuntime(): AgentRuntime {
  if (!shared.__nexoAgent) {
    const env = getEnv();
    const db = getDb();
    shared.__nexoAgent = createAgentRuntime({
      model: env.LLM_MODEL as AgentModel,
      modelName: env.LLM_MODEL,
      deps: {
        serviceDesk: getServiceDesk(),
        conversations: getConversations(),
        drafts: new DraftStore(db),
        decisions: new DecisionStore(db),
        now: () => new Date(),
        newId: randomUUID,
      },
    });
  }
  return shared.__nexoAgent;
}

export { runTurn, type TurnInput, type TurnRequest } from "./turn";
export type { AgentRuntime } from "./runtime";
