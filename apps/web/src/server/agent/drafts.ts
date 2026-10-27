import type { DraftPart } from "@/server/conversations/types";
import type { Draft } from "@/server/drafts/store";

import type { TurnContext } from "./context";

/** How a draft appears in the chat: the card with Confirmar, Editar and Cancelar. */
export function toDraftPart(draft: Draft): DraftPart {
  const base = { type: "draft" as const, draftId: draft.id, kind: draft.kind, status: draft.status, ticketId: draft.ticketId };
  switch (draft.kind) {
    case "ticket_create": {
      const payload = draft.payload;
      return {
        ...base,
        title: payload.title,
        description: payload.description,
        category: payload.category,
        subcategory: payload.subcategory,
        priority: payload.priority,
        affected: payload.affected,
        slaLabel: payload.slaLabel,
        dueAt: payload.dueAt,
        similar: payload.similar,
      };
    }
    case "ticket_update":
      return {
        ...base,
        title: `Adicionar informação ao ${draft.payload.ticketId}`,
        description: draft.payload.text,
        category: null,
        subcategory: null,
        priority: null,
        affected: null,
        slaLabel: null,
        dueAt: null,
        similar: [],
      };
    case "ticket_reopen":
      return {
        ...base,
        title: `Reabrir o ${draft.payload.ticketId}`,
        description: draft.payload.reason,
        category: null,
        subcategory: null,
        priority: null,
        affected: null,
        slaLabel: null,
        dueAt: null,
        similar: [],
      };
  }
}

/** Updates the card of a draft that was already shown, so the history never shows a stale "pending". */
export function setDraftPartStatus(
  ctx: Pick<TurnContext, "deps">,
  draft: Pick<Draft, "id" | "messageId">,
  status: DraftPart["status"],
  ticketId?: string,
): void {
  if (!draft.messageId) return;
  ctx.deps.conversations.updateMessageParts(draft.messageId, (parts) =>
    parts.map((part) =>
      part.type === "draft" && part.draftId === draft.id ? { ...part, status, ticketId: ticketId ?? part.ticketId } : part,
    ),
  );
}

/** A new draft, or a handoff, replaces whatever was waiting for confirmation. */
export function supersedePendingDrafts(ctx: Pick<TurnContext, "deps" | "conversationId">): void {
  for (const draft of ctx.deps.drafts.supersedePending(ctx.conversationId)) {
    setDraftPartStatus(ctx, draft, "superseded");
  }
}
