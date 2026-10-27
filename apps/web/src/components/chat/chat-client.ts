import type { TurnEvent } from "@/server/chat/events";
import type { ChatState as ServerChatState } from "@/server/chat/load";

import type { ChatError } from "./chat-reducer";
import { readEvents } from "./ndjson";

export interface ChatRequestBody {
  conversationId?: string;
  content?: string;
  action?: { type: "confirm_draft" | "cancel_draft"; draftId: number } | { type: "retry" };
}

export type StreamResult = { ok: true } | { ok: false; status: number; error: ChatError };

const NETWORK_ERROR: ChatError = {
  code: "network",
  message: "Sem conexão com o servidor. Confira sua rede e tente de novo.",
  retryable: true,
};

/** Sends one request to the chat and hands every event of the turn to `onEvent` as it arrives. */
export async function streamTurn(body: ChatRequestBody, onEvent: (event: TurnEvent) => void): Promise<StreamResult> {
  let response: Response;
  try {
    response = await fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }

  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    return {
      ok: false,
      status: response.status,
      error: {
        code: payload?.error?.code ?? "http_error",
        message: payload?.error?.message ?? "Não foi possível enviar a mensagem. Tente de novo.",
        retryable: response.status >= 500 || response.status === 429,
      },
    };
  }

  try {
    for await (const event of readEvents(response.body)) onEvent(event);
    return { ok: true };
  } catch {
    return {
      ok: false,
      status: 0,
      error: { code: "stream_interrupted", message: "A conexão caiu no meio da resposta. O que foi salvo aparece ao atualizar.", retryable: false },
    };
  }
}

/** The stored conversation, or `null` when the request fails (the screen then keeps what it has). */
export async function fetchChat(): Promise<ServerChatState | null> {
  try {
    const response = await fetch("/api/chat", { cache: "no-store" });
    return response.ok ? ((await response.json()) as ServerChatState) : null;
  } catch {
    return null;
  }
}

export async function startConversation(): Promise<boolean> {
  try {
    return (await fetch("/api/chat/conversations", { method: "POST" })).ok;
  } catch {
    return false;
  }
}
