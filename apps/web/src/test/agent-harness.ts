import { createAgentRuntime } from "@/server/agent/runtime";
import { DecisionStore } from "@/server/agent/decision-store";
import { ConversationStore } from "@/server/conversations/store";
import { openDatabase } from "@/server/db/open";
import { DraftStore } from "@/server/drafts/store";

import { FakeServiceDesk } from "./fake-service-desk";
import { NOW } from "./fixtures";
import { scriptedModel, type ScriptedStep } from "./scripted-model";

/** The real agent, stores and tools, wired to an in-memory database, a fake service desk and a scripted model. */
export function createHarness(steps: ScriptedStep[], options: { messageLimit?: number; serviceDesk?: FakeServiceDesk } = {}) {
  const serviceDesk = options.serviceDesk ?? new FakeServiceDesk();
  const db = openDatabase(":memory:");
  let counter = 0;
  const newId = () => `id-${++counter}`;
  const deps = {
    serviceDesk,
    conversations: new ConversationStore(db, { messageLimit: options.messageLimit ?? 30, now: () => NOW, newId }),
    drafts: new DraftStore(db, () => NOW),
    decisions: new DecisionStore(db, () => NOW),
    now: () => NOW,
    newId,
  };
  const model = scriptedModel(steps);
  const runtime = createAgentRuntime({ model: model as never, modelName: "scripted/model", deps, env: {} });
  return { runtime, deps, model, serviceDesk };
}
