import { z } from "zod";

import { CONVERSATION_ERROR_STATUS, type ConversationError } from "@/server/conversations/errors";
import type { AnalystRef } from "@/server/conversations/types";
import { ServiceDeskError } from "@/server/servicedesk/errors";

import type { ConsoleDeps } from "./load";

export const consoleActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("assume") }),
  z.object({ type: z.literal("message"), content: z.string().trim().min(1).max(2000) }),
  z.object({ type: z.literal("return") }),
  z.object({ type: z.literal("close") }),
  z.object({ type: z.literal("read") }),
]);
export type ConsoleAction = z.infer<typeof consoleActionSchema>;

/**
 * What the analyst sees when the conversation refused the action. Two analysts can click "assume"
 * at the same moment, or the employee's conversation can be closed under the analyst's feet; the
 * state machine's own wording is for developers, so those cases get a sentence of their own.
 */
export function describeConsoleError(error: ConversationError, action: ConsoleAction): { status: number; code: string; message: string } {
  const status = CONVERSATION_ERROR_STATUS[error.code];
  if (error.code !== "invalid_transition") return { status, code: error.code, message: error.message };
  const message =
    action.type === "assume"
      ? "Esta conversa já foi assumida por outro analista ou foi encerrada."
      : "A conversa mudou de estado enquanto você olhava. Atualize a tela.";
  return { status, code: error.code, message };
}

/**
 * What an analyst can do with a conversation. The store decides who may do what (only whoever took
 * the conversation can answer, return or close it, and only one analyst can take it); this adds
 * the side effect on the service desk. Returns a notice when something secondary could not be done.
 */
export async function runConsoleAction(
  deps: ConsoleDeps,
  analyst: AnalystRef,
  conversationId: string,
  action: ConsoleAction,
): Promise<{ notice: string | null }> {
  const { conversations, serviceDesk } = deps;

  switch (action.type) {
    case "assume": {
      conversations.assume(conversationId, analyst);
      const unmarked: string[] = [];
      // The ticket that was handed over now has someone on it (and that counts as the service desk's response).
      for (const link of conversations.linkedTickets(conversationId).filter((entry) => entry.relation === "transferred")) {
        try {
          await serviceDesk.assumeTicket(analyst.email, link.ticketId, `assume-${conversationId}-${link.ticketId}`);
        } catch (error) {
          if (!(error instanceof ServiceDeskError)) throw error;
          unmarked.push(link.ticketId);
        }
      }
      return {
        notice: unmarked.length > 0 ? `Você assumiu a conversa, mas não foi possível marcar ${unmarked.join(", ")} como em atendimento agora.` : null,
      };
    }
    case "message":
      conversations.appendMessage(conversationId, { role: "analyst", content: action.content, author: analyst });
      // Answering means having read everything the employee wrote so far.
      conversations.markReadByAnalyst(conversationId);
      return { notice: null };
    case "return":
      conversations.returnToAgent(conversationId, analyst);
      return { notice: null };
    case "close":
      conversations.close(conversationId, "analyst", analyst);
      return { notice: null };
    case "read":
      conversations.markReadByAnalyst(conversationId);
      return { notice: null };
  }
}
