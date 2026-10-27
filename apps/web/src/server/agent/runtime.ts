import { Agent } from "@mastra/core/agent";

import type { AgentDeps, TurnContext } from "./context";
import { buildInstructions, type PromptContext } from "./instructions";
import { buildTools } from "./tools";
import { TURN_KEY } from "./tools/shared";

export type AgentModel = ConstructorParameters<typeof Agent>[0]["model"];

export interface AgentRuntime {
  agent: Agent;
  /** `provider/model`, as Mastra's model router names it. */
  modelName: string;
  deps: AgentDeps;
  env: Record<string, string | undefined>;
  /** Equipment and department per employee, so the directory is asked once in a while, not on every message. */
  profiles: Map<string, { at: number; profile: Awaited<ReturnType<AgentDeps["serviceDesk"]["getUser"]>> }>;
}

const EMPTY_PROMPT: PromptContext = {
  now: new Date(0),
  employeeName: "Funcionário",
  department: null,
  device: null,
  pendingDraft: null,
  knownTickets: [],
};

export interface RuntimeOptions {
  model: AgentModel;
  modelName: string;
  deps: AgentDeps;
  env?: Record<string, string | undefined>;
}

/** The Mastra agent: the model, the tools, and instructions rebuilt on every turn from what the turn knows. */
export function createAgentRuntime({ model, modelName, deps, env = process.env }: RuntimeOptions): AgentRuntime {
  const agent = new Agent({
    id: "nexo-assist",
    name: "Nexo Assist",
    instructions: ({ requestContext }) => {
      const turn = requestContext.get(TURN_KEY) as TurnContext | undefined;
      return buildInstructions(turn?.prompt ?? EMPTY_PROMPT, modelName);
    },
    model,
    tools: buildTools(),
  });
  return { agent, modelName, deps, env, profiles: new Map() };
}
