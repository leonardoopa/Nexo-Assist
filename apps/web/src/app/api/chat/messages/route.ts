import type { NextRequest } from "next/server";
import { z } from "zod";

import { getAgentRuntime, runTurn, type TurnRequest } from "@/server/agent";
import { requireEmployee } from "@/server/auth/request";
import { encodeEvent } from "@/server/chat/events";
import { toConversationView } from "@/server/chat/view";
import { isSameOrigin, jsonError } from "@/server/http";
import { createRateLimiter } from "@/server/rate-limit";

// Each message can cost a model call, so an employee is limited on top of the per-session message cap.
const perEmployee = createRateLimiter({ limit: 20, windowMs: 60_000 });

const bodySchema = z
  .object({
    conversationId: z.string().min(1).max(100).optional(),
    content: z.string().trim().min(1).max(2000).optional(),
    action: z
      .discriminatedUnion("type", [
        z.object({ type: z.literal("confirm_draft"), draftId: z.number().int().positive() }),
        z.object({ type: z.literal("cancel_draft"), draftId: z.number().int().positive() }),
        z.object({ type: z.literal("retry") }),
      ])
      .optional(),
  })
  .refine((body) => (body.content === undefined) !== (body.action === undefined), { message: "Envie `content` ou `action`." });

/**
 * One turn of the chat as a stream of newline-delimited JSON events: the employee's message, each
 * step the agent takes, the reply as it is written, and the stored message with its decision.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("forbidden_origin", "Origem não permitida.", 403);
  const auth = await requireEmployee(request);
  if ("response" in auth) return auth.response;
  const { session } = auth;

  const limit = perEmployee.check(session.email);
  if (!limit.allowed) {
    return jsonError("rate_limited", `Muitas mensagens em pouco tempo. Tente de novo em ${limit.retryAfterSeconds} s.`, 429, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("invalid_input", "Mensagem inválida: escreva entre 1 e 2000 caracteres.", 400);
  const { conversationId, content, action } = parsed.data;

  const runtime = getAgentRuntime();
  const { conversations, serviceDesk } = runtime.deps;

  let conversation;
  if (conversationId) {
    conversation = conversations.getForEmployee(conversationId, session.email);
    if (!conversation) return jsonError("conversation_not_found", "Conversa não encontrada.", 404);
  } else if (content !== undefined) {
    const profile = await serviceDesk.getUser(session.email).catch(() => null);
    conversation = conversations.resumeOrStart({ email: session.email, name: session.name, department: profile?.department ?? null }).conversation;
  } else {
    return jsonError("invalid_input", "Informe a conversa para esta ação.", 400);
  }

  const turn: TurnRequest = content !== undefined ? { kind: "message", content } : action!.type === "retry" ? { kind: "retry" } : { kind: action!.type, draftId: action!.draftId };
  const events = runTurn(runtime, { employeeEmail: session.email, conversationId: conversation.id, request: turn });
  const encoder = new TextEncoder();
  let gone = false;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      // The first line tells the screen which conversation this is (it may have just been created).
      controller.enqueue(encoder.encode(encodeEvent({ type: "conversation", conversation: toConversationView(conversation, conversations.messageLimit) })));
      // A closed tab must not abort the turn: it keeps running so the answer is saved for when they come back.
      for await (const event of events) {
        if (!gone) controller.enqueue(encoder.encode(encodeEvent(event)));
      }
      if (!gone) controller.close();
    },
    cancel() {
      gone = true;
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
