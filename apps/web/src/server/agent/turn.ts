import { RequestContext } from "@mastra/core/request-context";

import type { TurnErrorCode, TurnEvent } from "@/server/chat/events";
import { toConversationView, toMessageView } from "@/server/chat/view";
import { ConversationError } from "@/server/conversations/errors";
import type { Conversation, Message, MessagePart } from "@/server/conversations/types";
import { draftLabel, type Draft } from "@/server/drafts/store";

import { createAsyncQueue } from "./async-queue";
import { cancelDraft, confirmDraft } from "./confirm";
import { createTurnContext, type TurnContext } from "./context";
import { buildDecision, type Guardrail, type Intent } from "./decision";
import { supersedePendingDrafts, toDraftPart } from "./drafts";
import { planHandoff, transferTicketForHandoff } from "./handoff";
import type { PromptContext } from "./instructions";
import { classifyLlmError, llmConfigProblem } from "./model";
import { TurnError, type AssistantOutput } from "./output";
import { classifyConfirmation } from "./policy/confirmation";
import { LOW_CONFIDENCE } from "./policy/confidence";
import { ticketIdsIn, unknownTicketIds } from "./policy/reply-guard";
import { REPLY_TOOL, type ReplyInput } from "./reply-schema";
import type { AgentRuntime } from "./runtime";
import { createStringFieldExtractor } from "./stream-field";
import { TURN_KEY, snapshotOf } from "./tools/shared";

const MAX_STEPS = 6;
const MAX_OUTPUT_TOKENS = 1200;
const TOTAL_TIMEOUT_MS = 45_000;
const FIRST_CHUNK_TIMEOUT_MS = 20_000;
const PROFILE_TTL_MS = 10 * 60_000;

const GUARD_MESSAGE =
  "Desculpe, não consegui confirmar essas informações com segurança. Pode reformular, ou prefere falar com um analista?";

export type TurnRequest =
  | { kind: "message"; content: string }
  | { kind: "confirm_draft"; draftId: number }
  | { kind: "cancel_draft"; draftId: number }
  | { kind: "retry" };

export interface TurnInput {
  /** The signed-in employee: the conversation must belong to them. */
  employeeEmail: string;
  conversationId: string;
  request: TurnRequest;
}

// One turn at a time per conversation: a double click must not run the agent twice.
const activeTurns = new Set<string>();

/**
 * Runs one turn of a conversation and reports it as a stream of events: the employee's message,
 * each step the agent takes, the reply as it is written, and the stored result with its decision.
 */
export function runTurn(runtime: AgentRuntime, input: TurnInput): AsyncIterable<TurnEvent> {
  const queue = createAsyncQueue<TurnEvent>();
  void (async () => {
    try {
      await executeTurn(runtime, input, queue.push);
    } catch (error) {
      queue.push(errorEvent(error));
    } finally {
      queue.push({ type: "done" });
      queue.close();
    }
  })();
  return queue;
}

function errorEvent(error: unknown): TurnEvent {
  if (error instanceof TurnError) return { type: "error", code: error.code, message: error.message, retryable: error.retryable };
  if (error instanceof ConversationError) {
    const code: TurnErrorCode = error.code === "limit_reached" ? "limit_reached" : error.code === "closed" ? "conversation_closed" : "internal";
    return { type: "error", code, message: error.message, retryable: false };
  }
  console.error("[agent] erro inesperado no turno", error);
  return { type: "error", code: "internal", message: "Algo deu errado do nosso lado. Tente de novo.", retryable: true };
}

async function executeTurn(runtime: AgentRuntime, input: TurnInput, emit: (event: TurnEvent) => void): Promise<void> {
  const { deps } = runtime;
  const store = deps.conversations;

  const conversation = store.getForEmployee(input.conversationId, input.employeeEmail);
  if (!conversation) throw new TurnError("conversation_not_found", "Conversa não encontrada.");
  if (conversation.status === "closed") throw new TurnError("conversation_closed", "Esta conversa foi encerrada. Comece uma nova.");
  if (activeTurns.has(conversation.id)) throw new TurnError("turn_in_progress", "Ainda estou respondendo à mensagem anterior.", true);

  activeTurns.add(conversation.id);
  try {
    const output = await produceOutput(runtime, conversation, input.request, emit);
    if (output) await finish(runtime, conversation.id, output, emit);
    const latest = store.get(conversation.id);
    if (latest) emit({ type: "conversation", conversation: toConversationView(latest, store.messageLimit) });
  } finally {
    activeTurns.delete(conversation.id);
  }
}

/** Decides what this request needs: a stored message only, a confirmation, a cancellation or the agent. */
async function produceOutput(
  runtime: AgentRuntime,
  conversation: Conversation,
  request: TurnRequest,
  emit: (event: TurnEvent) => void,
): Promise<AssistantOutput | null> {
  const { deps } = runtime;
  const store = deps.conversations;

  if (request.kind === "confirm_draft" || request.kind === "cancel_draft") {
    const draft = deps.drafts.get(request.draftId);
    if (conversation.status !== "agent" || !draft || draft.conversationId !== conversation.id || draft.status !== "pending") {
      throw new TurnError("draft_not_found", "Esse rascunho não está mais disponível.");
    }
    return request.kind === "confirm_draft" ? confirmDraft(runtime, conversation, draft, emit) : cancelDraft(runtime, conversation, draft, emit);
  }

  if (request.kind === "retry") {
    const last = [...store.messages(conversation.id)].reverse().find((message) => message.role !== "system");
    if (conversation.status !== "agent" || last?.role !== "user") throw new TurnError("nothing_to_retry", "Não há nada para repetir.");
    assertConfigured(runtime);
    return agentTurn(runtime, conversation, emit);
  }

  const content = request.content.trim();
  if (conversation.status !== "agent") {
    // With a person: the message is kept for the analyst and the agent stays silent.
    const { message } = store.appendMessage(conversation.id, { role: "user", content });
    emit({ type: "user_message", message: toMessageView(message, null) });
    return null;
  }

  const pending = deps.drafts.pending(conversation.id);
  const answer = pending ? classifyConfirmation(content) : "other";
  if (answer === "other") assertConfigured(runtime); // fail before keeping a message nobody can answer

  const { message } = store.appendMessage(conversation.id, { role: "user", content });
  emit({ type: "user_message", message: toMessageView(message, null) });
  emit({ type: "conversation", conversation: toConversationView(store.get(conversation.id) ?? conversation, store.messageLimit) });

  if (pending && answer === "confirm") return confirmDraft(runtime, conversation, pending, emit);
  if (pending && answer === "cancel") return cancelDraft(runtime, conversation, pending, emit);
  return agentTurn(runtime, conversation, emit);
}

function assertConfigured(runtime: AgentRuntime): void {
  const problem = llmConfigProblem(runtime.modelName, runtime.env);
  if (problem) throw new TurnError("llm_not_configured", problem);
}

/** Stores the assistant message with its decision, then applies a handoff if the agent decided on one. */
async function finish(runtime: AgentRuntime, conversationId: string, output: AssistantOutput, emit: (event: TurnEvent) => void): Promise<void> {
  const { deps } = runtime;
  const { message } = deps.conversations.appendMessage(conversationId, { role: "assistant", content: output.content, parts: output.parts });
  deps.decisions.save({ id: deps.newId(), conversationId, messageId: message.id, decision: output.decision });
  for (const draftId of output.attachDrafts) deps.drafts.attachMessage(draftId, message.id);
  emit({ type: "assistant_message", message: toMessageView(message, output.decision) });

  if (output.handoff) {
    const plan = output.handoff;
    supersedePendingDrafts(output.ctx);
    deps.conversations.handoff(conversationId, { reason: plan.reason, group: plan.group, summary: plan.summary, respondBy: plan.respondBy });
  }
}

// ---- the agent --------------------------------------------------------------------------------

async function agentTurn(runtime: AgentRuntime, conversation: Conversation, emit: (event: TurnEvent) => void): Promise<AssistantOutput> {
  const { deps } = runtime;
  const ctx = createTurnContext(deps, conversation.employee, conversation.id, emit);
  const history = deps.conversations.messages(conversation.id);
  ctx.prompt = await promptContext(runtime, ctx, history);

  const requestContext = new RequestContext();
  requestContext.set(TURN_KEY, ctx);

  const started = performance.now();
  const replyStreams = new Map<string, ReturnType<typeof createStringFieldExtractor>>();
  let fallbackText = "";
  let streamError: unknown;
  let inputTokens = 0;
  let outputTokens = 0;
  let modelSteps = 0;

  try {
    const result = await runtime.agent.stream(toModelMessages(history), {
      requestContext,
      maxSteps: MAX_STEPS,
      toolChoice: "required",
      stopWhen: () => ctx.reply !== null,
      modelSettings: {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.2,
        maxRetries: 1,
        timeout: { totalMs: TOTAL_TIMEOUT_MS, firstChunkMs: FIRST_CHUNK_TIMEOUT_MS },
      },
      abortSignal: AbortSignal.timeout(TOTAL_TIMEOUT_MS + 5_000),
    });

    for await (const raw of result.fullStream) {
      const chunk = raw as { type: string; payload?: Record<string, unknown> };
      const payload = chunk.payload ?? {};
      switch (chunk.type) {
        case "tool-call-input-streaming-start":
          if (payload.toolName === REPLY_TOOL) replyStreams.set(String(payload.toolCallId), createStringFieldExtractor("message"));
          break;
        case "tool-call-delta": {
          const delta = replyStreams.get(String(payload.toolCallId))?.push(String(payload.argsTextDelta ?? ""));
          if (delta) emit({ type: "text", delta });
          break;
        }
        case "text-delta":
          fallbackText += String(payload.text ?? "");
          break;
        case "error":
          streamError = payload.error;
          break;
      }
    }
    const usage = await result.usage;
    inputTokens = usage?.inputTokens ?? 0;
    outputTokens = usage?.outputTokens ?? 0;
    modelSteps = (await result.steps).length;
  } catch (error) {
    throw toTurnError(error);
  }
  if (streamError && !ctx.reply) throw toTurnError(streamError);

  return compose(runtime, ctx, history, {
    fallbackText,
    usage: { model: runtime.modelName, inputTokens, outputTokens, latencyMs: Math.round(performance.now() - started), modelSteps },
  });
}

function toTurnError(error: unknown): TurnError {
  if (error instanceof TurnError) return error;
  const { code, message, retryable } = classifyLlmError(error);
  return new TurnError(code, message, retryable);
}

async function promptContext(runtime: AgentRuntime, ctx: TurnContext, history: Message[]): Promise<PromptContext> {
  const profile = await profileFor(runtime, ctx.employee.email);
  const pending = runtime.deps.drafts.pending(ctx.conversationId);
  const known = new Set<string>(runtime.deps.conversations.linkedTickets(ctx.conversationId).map((link) => link.ticketId));
  for (const message of history) for (const id of ticketIdsIn(message.content)) known.add(id);

  return {
    now: runtime.deps.now(),
    employeeName: ctx.employee.name,
    department: profile?.department ?? ctx.employee.department,
    device: profile?.device ?? null,
    pendingDraft: pending ? describeDraft(pending) : null,
    knownTickets: [...known].slice(0, 8),
  };
}

function describeDraft(draft: Draft): string {
  const label = draftLabel(draft.id);
  switch (draft.kind) {
    case "ticket_create":
      return `${label}, open a ticket "${draft.payload.title}" (priority ${draft.payload.priority})`;
    case "ticket_update":
      return `${label}, add information to ${draft.payload.ticketId}`;
    case "ticket_reopen":
      return `${label}, reopen ${draft.payload.ticketId}`;
  }
}

/** The directory knows the employee's equipment; it is asked once in a while, and its trouble never blocks a turn. */
async function profileFor(runtime: AgentRuntime, email: string) {
  const now = runtime.deps.now().getTime();
  const cached = runtime.profiles.get(email);
  if (cached && now - cached.at < PROFILE_TTL_MS) return cached.profile;
  try {
    const profile = await runtime.deps.serviceDesk.getUser(email);
    runtime.profiles.set(email, { at: now, profile });
    return profile;
  } catch {
    return null;
  }
}

/** The stored history as the model reads it. Consecutive messages of one side are joined, as providers expect alternation. */
export type ModelMessage = { role: "user"; content: string } | { role: "assistant"; content: string };

export function toModelMessages(history: Message[]): ModelMessage[] {
  const messages: ModelMessage[] = [];
  for (const message of history) {
    if (message.role === "system") continue;
    const text = message.role === "analyst" ? `O analista ${message.author?.name ?? ""} disse: ${message.content}` : message.content;
    const last = messages.at(-1);
    const role = message.role === "user" ? "user" : "assistant";
    if (last && last.role === role) last.content = `${last.content}\n\n${text}`;
    else messages.push(role === "user" ? { role, content: text } : { role, content: text });
  }
  return messages;
}

// ---- turning the model's reply into a stored message ------------------------------------------

const AUTO_HANDOFF_INTENTS: ReadonlySet<Intent> = new Set(["answer_question", "check_ticket", "update_ticket", "open_ticket", "reopen_ticket"]);

async function compose(
  runtime: AgentRuntime,
  ctx: TurnContext,
  history: Message[],
  run: { fallbackText: string; usage: { model: string; inputTokens: number; outputTokens: number; latencyMs: number; modelSteps: number } },
): Promise<AssistantOutput> {
  const guardrails: Guardrail[] = [];
  let reply: ReplyInput;
  if (ctx.reply) {
    reply = ctx.reply;
  } else if (run.fallbackText.trim()) {
    reply = {
      message: run.fallbackText.trim().slice(0, 1500),
      decision: {
        intent: "unclear",
        understanding: "Não identificado.",
        action: "Respondeu em texto livre.",
        confidence: 0.4,
        rationale: "O modelo respondeu sem usar o formato estruturado.",
        rules: [],
      },
    };
    guardrails.push({ id: "unstructured_reply", detail: "O modelo respondeu fora do formato estruturado; a resposta foi mantida com confiança reduzida." });
  } else {
    throw new TurnError("llm_unavailable", "O assistente não conseguiu responder agora. Tente de novo.", true);
  }

  let message = reply.message.trim();
  let ui = reply.ui ?? {};

  // A ticket number that no tool returned for this employee never reaches the screen.
  const unknown = unknownTicketIds(message, allowedTicketIds(ctx, history));
  let guardrailTriggered = false;
  if (unknown.length > 0) {
    message = GUARD_MESSAGE;
    ui = { quickReplies: ["Falar com um analista"] };
    guardrailTriggered = true;
    guardrails.push({
      id: "unknown_ticket_reference",
      detail: `A resposta citava ${unknown.join(", ")}, que não veio de nenhuma consulta deste funcionário; foi substituída.`,
    });
  }

  // Unsure and no question would help: the agent hands the case to a person instead of guessing.
  const previous = runtime.deps.decisions.latest(ctx.conversationId);
  const unsureBefore = previous !== null && previous.confidence.score < LOW_CONFIDENCE;
  const intent = reply.decision.intent;
  const preview = buildDecisionFor(ctx, reply, run.usage, guardrails, guardrailTriggered);
  if (
    !ctx.handoff &&
    !guardrailTriggered && // a corrected reply already offers the employee a choice
    preview.confidence.score < LOW_CONFIDENCE &&
    (AUTO_HANDOFF_INTENTS.has(intent) || (intent === "unclear" && unsureBefore))
  ) {
    const lastUser = [...history].reverse().find((entry) => entry.role === "user")?.content ?? "";
    ctx.handoff = await planHandoff(ctx, {
      reason: "low_confidence",
      summary: `${ctx.employee.name} (${ctx.employee.department ?? "sem departamento"}): "${lastUser.slice(0, 200)}". O agent não teve segurança (${Math.round(preview.confidence.score * 100)}%) para decidir: ${reply.decision.rationale}`.slice(0, 600),
      ticketId: null,
      auto: true,
    });
    message = `${message} Não tenho segurança sobre como resolver isso, então chamei um analista do Suporte ${ctx.handoff.group}. Ele responde em até ${ctx.handoff.respondByLabel}.`;
    ui = {};
    guardrails.push({ id: "auto_handoff", detail: `Confiança de ${Math.round(preview.confidence.score * 100)}% abaixo de ${LOW_CONFIDENCE * 100}%: o caso foi transferido a um analista em vez de arriscar um palpite.` });
  }

  const plan = ctx.handoff;
  if (plan) {
    const transfer = await transferTicketForHandoff(ctx, plan);
    if (!transfer.ok) {
      guardrails.push({
        id: "ticket_transfer_failed",
        detail: `Não foi possível marcar o ${plan.ticketId} como transferido (sistema de chamados instável). O analista recebe o caso pela conversa.`,
      });
    }
  }

  if (ctx.duplicateBlocked.length > 0) {
    guardrails.push({
      id: "duplicate_blocked",
      detail: `Não foi criado um chamado novo: ${ctx.duplicateBlocked.join(", ")} já cobre${ctx.duplicateBlocked.length > 1 ? "m" : ""} o problema (Anexo A: sem duplicidade).`,
    });
  }
  const decision = buildDecisionFor(ctx, reply, run.usage, guardrails, guardrailTriggered);
  const parts = buildParts(ctx, ui, plan !== null);
  const lastDraft = ctx.drafts.at(-1);
  return {
    content: message,
    parts,
    decision,
    attachDrafts: plan === null && lastDraft ? [lastDraft.id] : [],
    handoff: plan,
    ctx,
  };
}

function buildDecisionFor(
  ctx: TurnContext,
  reply: ReplyInput,
  usage: { model: string; inputTokens: number; outputTokens: number; latencyMs: number; modelSteps: number },
  guardrails: Guardrail[],
  guardrailTriggered: boolean,
) {
  const plan = ctx.handoff;
  return buildDecision({
    intent: plan && plan.auto ? "handoff" : reply.decision.intent,
    understanding: reply.decision.understanding,
    action: plan && plan.auto ? "Transferiu o caso a um analista por falta de segurança." : reply.decision.action,
    rationale: reply.decision.rationale,
    modelConfidence: reply.decision.confidence,
    claimedRules: reply.decision.rules,
    ruleFacts: {
      priorityClassified: ctx.priority !== null,
      draftKinds: ctx.drafts.map((draft) => draft.kind),
      duplicateBlocked: ctx.duplicateBlocked.length > 0,
      handoffReason: plan?.reason ?? null,
      ticketLookups: ctx.seen.ticketLookups,
    },
    evidence: {
      knowledgeTopScore: reply.decision.intent === "answer_question" ? ctx.seen.knowledgeTopScore : null,
      toolErrors: ctx.toolErrors,
      explicitConfirmation: false,
      guardrailTriggered,
    },
    steps: ctx.trace,
    guardrails,
    handoff: plan ? { reason: plan.reason, group: plan.group, respondBy: plan.respondBy, ticketId: plan.ticketId, auto: plan.auto } : null,
    usage,
  }).decision;
}

/** Ticket numbers the agent may mention: returned for this employee, written by them, or already shown in this conversation. */
function allowedTicketIds(ctx: TurnContext, history: Message[]): Set<string> {
  const ids = new Set<string>([...ctx.seen.tickets.keys(), ...ctx.seen.notFoundIds]);
  for (const link of ctx.deps.conversations.linkedTickets(ctx.conversationId)) ids.add(link.ticketId);
  for (const message of history) {
    for (const id of ticketIdsIn(message.content)) ids.add(id);
    for (const part of message.parts) {
      if (part.type === "ticket_card") ids.add(part.ticket.id);
      if (part.type === "ticket_picker") for (const ticket of part.tickets) ids.add(ticket.id);
      if (part.type === "draft" && part.ticketId) ids.add(part.ticketId);
    }
  }
  return ids;
}

/** Cards and buttons come from what the tools returned in this turn, never from what the model claims. */
function buildParts(ctx: TurnContext, ui: NonNullable<ReplyInput["ui"]>, handedOff: boolean): MessagePart[] {
  const parts: MessagePart[] = [];
  for (const id of ui.showTicketCards ?? []) {
    const ticket = ctx.seen.tickets.get(id.trim().toUpperCase());
    if (ticket) parts.push({ type: "ticket_card", ticket: snapshotOf(ticket, true) });
  }
  if (ui.showTicketPicker) {
    const tickets = ctx.seen.lastListIds
      .map((id) => ctx.seen.tickets.get(id))
      .filter((ticket): ticket is NonNullable<typeof ticket> => ticket !== undefined && ticket.status !== "resolvido")
      .slice(0, 6);
    if (tickets.length > 0) parts.push({ type: "ticket_picker", tickets: tickets.map((ticket) => snapshotOf(ticket)) });
  }
  const draft = ctx.drafts.at(-1);
  if (draft && !handedOff) parts.push(toDraftPart(draft));
  else if (ui.quickReplies && ui.quickReplies.length > 0 && !handedOff) parts.push({ type: "quick_replies", options: ui.quickReplies });
  return parts;
}
