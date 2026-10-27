import { PRIORITY_LABEL } from "@/lib/labels";
import type { Conversation, TicketRelation } from "@/server/conversations/types";
import { draftLabel, type Draft } from "@/server/drafts/store";
import { ServiceDeskApiError, ServiceDeskContractError, ServiceDeskUnavailableError } from "@/server/servicedesk/errors";
import type { Ticket, TicketDetail } from "@/server/servicedesk/schemas";

import { createTurnContext, type TurnContext } from "./context";
import { buildDecision } from "./decision";
import { setDraftPartStatus } from "./drafts";
import type { AssistantOutput } from "./output";
import type { AgentRuntime } from "./runtime";
import { runStep } from "./steps";
import type { TurnEvent } from "@/server/chat/events";
import { snapshotOf } from "./tools/shared";

/**
 * Confirming and cancelling never go through the model. The employee said yes or no, so the
 * outcome is certain: the action runs, and the answer is written from what actually happened.
 * That also keeps these steps instant and free of model cost.
 */

async function execute(ctx: TurnContext, draft: Draft): Promise<{ ticket: TicketDetail; relation: TicketRelation }> {
  const email = ctx.employee.email;
  const key = `draft-${draft.id}`; // the same key on every retry: confirming twice never creates two tickets
  const { serviceDesk } = ctx.deps;

  switch (draft.kind) {
    case "ticket_create": {
      const p = draft.payload;
      const ticket = await runStep(
        ctx,
        { tool: "create_ticket", input: { category: p.category, priority: p.priority } },
        () =>
          serviceDesk.createTicket(
            email,
            { title: p.title, description: p.description, type: p.type, category: p.category, subcategory: p.subcategory ?? undefined, priority: p.priority, affected: p.affected },
            key,
          ),
        (created) => `Criou o ${created.id}`,
      );
      return { ticket, relation: "created" };
    }
    case "ticket_update": {
      const p = draft.payload;
      const ticket = await runStep(
        ctx,
        { tool: "add_update", subject: p.ticketId, input: { ticketId: p.ticketId } },
        () => serviceDesk.addUpdate(email, p.ticketId, p.text, key),
        (updated) => `Atualizou o ${updated.id}`,
      );
      return { ticket, relation: "updated" };
    }
    case "ticket_reopen": {
      const p = draft.payload;
      const ticket = await runStep(
        ctx,
        { tool: "reopen_ticket", subject: p.ticketId, input: { ticketId: p.ticketId } },
        () => serviceDesk.reopenTicket(email, p.ticketId, p.reason, key),
        (reopened) => `Reabriu o ${reopened.id}`,
      );
      return { ticket, relation: "reopened" };
    }
  }
}

function successText(draft: Draft, ticket: Ticket): string {
  switch (draft.kind) {
    case "ticket_create":
      return `Pronto: abri o chamado ${ticket.id} com prioridade ${PRIORITY_LABEL[ticket.priority].toLowerCase()}. A primeira resposta vem em até ${ticket.sla.label}.`;
    case "ticket_update":
      return ticket.sla.overdue
        ? `Pronto: acrescentei sua informação ao ${ticket.id}. Esse chamado já passou do prazo; quer que eu chame um analista?`
        : `Pronto: acrescentei sua informação ao ${ticket.id}. O prazo de resposta é de ${ticket.sla.label}.`;
    case "ticket_reopen":
      return `Pronto: reabri o ${ticket.id}. A primeira resposta vem em até ${ticket.sla.label}.`;
  }
}

const KIND_ACTION = {
  ticket_create: "criar o chamado",
  ticket_update: "atualizar o chamado",
  ticket_reopen: "reabrir o chamado",
} as const;

function decisionFor(ctx: TurnContext, draft: Draft, input: { intent: "confirm_action" | "cancel_action"; understanding: string; action: string; rationale: string; confirmed: boolean }) {
  return buildDecision({
    intent: input.intent,
    understanding: input.understanding,
    action: input.action,
    rationale: input.rationale,
    modelConfidence: 1,
    claimedRules: [],
    ruleFacts: { priorityClassified: false, draftKinds: [draft.kind], duplicateBlocked: false, handoffReason: null, ticketLookups: false },
    evidence: { knowledgeTopScore: null, toolErrors: ctx.toolErrors, explicitConfirmation: input.confirmed, guardrailTriggered: false },
    steps: ctx.trace,
    guardrails: [],
    handoff: null,
    usage: null,
  }).decision;
}

export async function confirmDraft(
  runtime: AgentRuntime,
  conversation: Conversation,
  draft: Draft,
  emit: (event: TurnEvent) => void,
): Promise<AssistantOutput> {
  const ctx = createTurnContext(runtime.deps, conversation.employee, conversation.id, emit);
  const label = draftLabel(draft.id);

  try {
    const { ticket, relation } = await execute(ctx, draft);
    runtime.deps.drafts.resolve(draft.id, "confirmed", ticket.id);
    setDraftPartStatus(ctx, draft, "confirmed", ticket.id);
    runtime.deps.conversations.linkTicket(conversation.id, ticket.id, relation);

    const content = successText(draft, ticket);
    const offerAnalyst = draft.kind === "ticket_update" && ticket.sla.overdue;
    return {
      content,
      parts: [
        { type: "ticket_card", ticket: snapshotOf(ticket, true) },
        ...(offerAnalyst ? [{ type: "quick_replies" as const, options: ["Falar com um analista", "Não, obrigado"] }] : []),
      ],
      decision: decisionFor(ctx, draft, {
        intent: "confirm_action",
        understanding: `Confirmou o rascunho ${label}.`,
        action: `Executou: ${KIND_ACTION[draft.kind]} ${ticket.id}.`,
        rationale: "O rascunho só vira ação depois da confirmação do funcionário (Anexo A). A chave de idempotência do rascunho impede duplicar se a confirmação for repetida.",
        confirmed: true,
      }),
      attachDrafts: [],
      handoff: null,
      ctx,
    };
  } catch (error) {
    if (error instanceof ServiceDeskUnavailableError || error instanceof ServiceDeskContractError) {
      ctx.toolErrors += 1;
      return {
        content: `Não consegui concluir agora: o sistema de chamados está instável. O rascunho ${label} continua guardado; é só confirmar de novo em instantes.`,
        parts: [],
        decision: decisionFor(ctx, draft, {
          intent: "confirm_action",
          understanding: `Confirmou o rascunho ${label}.`,
          action: `Tentou ${KIND_ACTION[draft.kind]}, mas o sistema de chamados estava indisponível. Nada foi alterado.`,
          rationale: "O rascunho continua pendente. Confirmar de novo é seguro: a mesma chave de idempotência evita duplicar.",
          confirmed: true,
        }),
        attachDrafts: [],
        handoff: null,
        ctx,
      };
    }
    if (error instanceof ServiceDeskApiError) {
      runtime.deps.drafts.resolve(draft.id, "cancelled");
      setDraftPartStatus(ctx, draft, "cancelled");
      return {
        content: `Não foi possível concluir: ${error.message} O rascunho ${label} foi cancelado.`,
        parts: [],
        decision: decisionFor(ctx, draft, {
          intent: "confirm_action",
          understanding: `Confirmou o rascunho ${label}.`,
          action: `O sistema de chamados recusou ${KIND_ACTION[draft.kind]} (${error.code}). Nada foi alterado.`,
          rationale: "Uma regra do service desk impediu a ação; o rascunho foi cancelado para não ficar pendente.",
          confirmed: true,
        }),
        attachDrafts: [],
        handoff: null,
        ctx,
      };
    }
    throw error;
  }
}

export function cancelDraft(
  runtime: AgentRuntime,
  conversation: Conversation,
  draft: Draft,
  emit: (event: TurnEvent) => void,
): AssistantOutput {
  const ctx = createTurnContext(runtime.deps, conversation.employee, conversation.id, emit);
  const label = draftLabel(draft.id);
  runtime.deps.drafts.resolve(draft.id, "cancelled");
  setDraftPartStatus(ctx, draft, "cancelled");
  const changed = draft.kind === "ticket_create" ? "criei nada" : "alterei nada";

  return {
    content: `Tudo bem, cancelei o rascunho ${label}. Não ${changed}. Posso ajudar em mais alguma coisa?`,
    parts: [],
    decision: decisionFor(ctx, draft, {
      intent: "cancel_action",
      understanding: `Cancelou o rascunho ${label}.`,
      action: `Descartou o rascunho ${label} sem criar nem alterar nada.`,
      rationale: "O funcionário recusou o rascunho; nenhuma ação foi executada.",
      confirmed: true,
    }),
    attachDrafts: [],
    handoff: null,
    ctx,
  };
}
