import type { SupportGroup } from "@/lib/domain";
import type { ConversationStore } from "@/server/conversations/store";
import type { EmployeeRef, HandoffReason } from "@/server/conversations/types";
import type { DraftStore, Draft } from "@/server/drafts/store";
import type { TurnEvent } from "@/server/chat/events";
import type { ServiceDeskPort } from "@/server/servicedesk/port";
import type { Ticket } from "@/server/servicedesk/schemas";

import type { DecisionStore } from "./decision-store";
import type { StepRecord } from "./decision";
import type { PromptContext } from "./instructions";
import type { PriorityDecision, PriorityFacts } from "./policy/priority";
import type { ReplyInput } from "./reply-schema";

export interface AgentDeps {
  serviceDesk: ServiceDeskPort;
  conversations: ConversationStore;
  drafts: DraftStore;
  decisions: DecisionStore;
  now: () => Date;
  newId: () => string;
}

/** A handoff the agent decided on. It runs after the reply is saved, so the reply comes before the "transferred" event. */
export interface HandoffPlan {
  reason: HandoffReason;
  group: SupportGroup;
  summary: string;
  ticketId: string | null;
  respondBy: string | null;
  respondByLabel: string;
  auto: boolean;
}

/** Everything one turn knows and collects: shared by the tools, which read it from the request context. */
export interface TurnContext {
  turnId: string;
  employee: EmployeeRef;
  conversationId: string;
  deps: AgentDeps;
  emit: (event: TurnEvent) => void;
  /** Filled in before the model runs; the agent's instructions are built from it. */
  prompt: PromptContext | null;
  trace: StepRecord[];
  seen: {
    /** Tickets the service desk returned for this employee in this turn. */
    tickets: Map<string, Ticket>;
    lastListIds: string[];
    knowledgeTopScore: number | null;
    notFoundIds: Set<string>;
    ticketLookups: boolean;
  };
  priority: { facts: PriorityFacts; decision: PriorityDecision; slaLabel: string; dueAt: string | null } | null;
  drafts: Draft[];
  duplicateBlocked: string[];
  handoff: HandoffPlan | null;
  reply: ReplyInput | null;
  toolErrors: number;
}

export function createTurnContext(deps: AgentDeps, employee: EmployeeRef, conversationId: string, emit: (event: TurnEvent) => void): TurnContext {
  return {
    turnId: deps.newId(),
    employee,
    conversationId,
    deps,
    emit,
    prompt: null,
    trace: [],
    seen: { tickets: new Map(), lastListIds: [], knowledgeTopScore: null, notFoundIds: new Set(), ticketLookups: false },
    priority: null,
    drafts: [],
    duplicateBlocked: [],
    handoff: null,
    reply: null,
    toolErrors: 0,
  };
}
