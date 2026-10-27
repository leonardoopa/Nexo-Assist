"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import type { ChatState as ServerChatState } from "@/server/chat/load";

import { ConversationBanner, ErrorNotice } from "./banners";
import { fetchChat, startConversation, streamTurn, type ChatRequestBody } from "./chat-client";
import { chatReducer, initialChatState } from "./chat-reducer";
import { Composer } from "./composer";
import { EmptyState, MessageList } from "./message-list";
import { LiveTurn } from "./message";

const POLL_MS = 5000;
const EMPTY_CHAT: ServerChatState = { conversation: null, messages: [], pendingDraftId: null };

/** Errors whose cause is on the server side after the message was stored: retrying means "answer it again". */
const answerAgain = (code: string) => code !== "llm_not_configured" && /^(llm_|internal$|turn_in_progress$)/.test(code);

interface ChatAppProps {
  initial: ServerChatState;
  employeeName: string;
  messageLimit: number;
}

/**
 * The employee's side of the chat. It sends what they write, draws the turn as it streams (steps
 * first, then the reply), shows cards and the draft for confirmation, and keeps the conversation
 * in sync while a person is attending it.
 */
export function ChatApp({ initial, employeeName, messageLimit }: ChatAppProps) {
  const router = useRouter();
  const [state, dispatch] = useReducer(chatReducer, initial, initialChatState);
  const [hint, setHint] = useState<string | null>(null);
  const lastRequest = useRef<ChatRequestBody | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const { conversation, messages, pendingDraftId, turn, error } = state;
  const status = conversation?.status ?? "agent";
  const withPerson = status === "awaiting_analyst" || status === "with_analyst";
  const closed = status === "closed";
  const atLimit = status === "agent" && conversation !== null && conversation.messageCount >= conversation.messageLimit;
  const canWrite = !turn.running && !atLimit && !closed;
  const limit = conversation?.messageLimit ?? messageLimit;

  const run = useCallback(async (body: ChatRequestBody) => {
    lastRequest.current = body;
    dispatch({ type: "turn_started" });
    const result = await streamTurn(body, (event) => dispatch({ type: "event", event }));
    if (!result.ok) {
      if (result.status === 401) {
        router.replace("/login"); // the session expired
        return;
      }
      dispatch({ type: "failed", error: result.error });
    }
    // The stored conversation is the truth: it also brings the cards whose status the turn changed.
    const fresh = await fetchChat();
    if (fresh) dispatch({ type: "loaded", state: fresh });
  }, [router]);

  const where = conversation && !closed ? { conversationId: conversation.id } : {};

  const send = (content: string) => {
    if (!canWrite) return;
    setHint(null);
    void run({ ...where, content });
  };
  const decide = (type: "confirm_draft" | "cancel_draft", draftId: number) => {
    if (turn.running || !conversation) return;
    void run({ conversationId: conversation.id, action: { type, draftId } });
  };
  const edit = () => {
    setHint("O que você quer mudar no rascunho? Escreva abaixo e eu monto outro.");
    inputRef.current?.focus();
  };
  const retry = () => {
    if (!error) return;
    if (answerAgain(error.code) && conversation) void run({ conversationId: conversation.id, action: { type: "retry" } });
    else if (lastRequest.current) void run(lastRequest.current);
  };
  const newConversation = async () => {
    const started = await startConversation();
    const fresh = started ? await fetchChat() : null;
    dispatch({ type: "loaded", state: fresh ?? EMPTY_CHAT });
    dispatch({ type: "dismiss_error" });
  };

  // While a person attends, their messages arrive from the service desk side: look for them.
  useEffect(() => {
    if (!withPerson || turn.running) return;
    const timer = setInterval(async () => {
      const fresh = await fetchChat();
      if (fresh) dispatch({ type: "loaded", state: fresh });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [withPerson, turn.running]);

  // ⌘↵ confirms the draft when the field is empty (with text, Enter in the field sends it as usual).
  useEffect(() => {
    if (pendingDraftId === null || turn.running || !conversation) return;
    const conversationId = conversation.id;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
      if (inputRef.current?.value.trim()) return;
      event.preventDefault();
      void run({ conversationId, action: { type: "confirm_draft", draftId: pendingDraftId } });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingDraftId, turn.running, conversation, run]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, turn.steps.length, turn.text.length, error]);

  const empty = messages.length === 0 && !turn.running;

  return (
    <main className="flex min-h-0 flex-1 flex-col bg-desk">
      <div className="flex flex-1 flex-col px-4 py-7 md:px-10">
        <div className="mx-auto flex w-full max-w-[820px] flex-1 flex-col gap-5">
          {empty ? (
            <EmptyState name={employeeName} disabled={!canWrite} onPick={send} />
          ) : (
            <MessageList
              messages={messages}
              interactive={canWrite && !withPerson}
              actions={{
                busy: turn.running,
                pendingDraftId,
                onSend: send,
                onConfirm: (draftId) => decide("confirm_draft", draftId),
                onCancel: (draftId) => decide("cancel_draft", draftId),
                onEdit: edit,
              }}
            />
          )}
          {turn.running ? <LiveTurn steps={turn.steps} text={turn.text} /> : null}
          {error ? (
            <ErrorNotice error={error} onRetry={retry} onNew={newConversation} onDismiss={() => dispatch({ type: "dismiss_error" })} />
          ) : null}
          <div ref={endRef} />
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-rule bg-desk/95 px-4 pb-4 pt-3 backdrop-blur md:px-10">
        <div className="mx-auto flex w-full max-w-[820px] flex-col gap-2">
          <ConversationBanner conversation={conversation} atLimit={atLimit} onNew={newConversation} />
          <Composer
            disabled={!canWrite}
            placeholder={withPerson ? "Escreva para o analista…" : "Escreva para o Nexo…"}
            counter={`${Math.min(conversation?.messageCount ?? 0, limit)}/${limit} mensagens nesta sessão`}
            hint={hint}
            inputRef={inputRef}
            onSend={send}
          />
        </div>
      </div>
    </main>
  );
}
