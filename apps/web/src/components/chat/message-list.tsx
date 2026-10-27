import { NexoMark } from "@/components/brand/nexo-mark";
import { firstName } from "@/lib/format";
import type { MessageView } from "@/server/chat/view";

import { AnalystMessage, AssistantMessage, SystemEvent, UserMessage, type AssistantActions } from "./message";

interface MessageListProps {
  messages: MessageView[];
  /** The employee can answer right now, so the latest answer's buttons are live. */
  interactive: boolean;
  actions: AssistantActions;
}

export function MessageList({ messages, interactive, actions }: MessageListProps) {
  const lastId = messages.at(-1)?.id;
  return (
    <div role="log" aria-label="Conversa" className="flex flex-col gap-5">
      {messages.map((message) => {
        switch (message.role) {
          case "user":
            return <UserMessage key={message.id} message={message} />;
          case "assistant":
            return <AssistantMessage key={message.id} message={message} interactive={interactive && message.id === lastId} actions={actions} />;
          case "analyst":
            return <AnalystMessage key={message.id} message={message} />;
          case "system":
            return <SystemEvent key={message.id} message={message} />;
        }
      })}
    </div>
  );
}

const STARTERS = ["Meu notebook não conecta na VPN", "Qual o status do meu chamado?", "Preciso de um segundo monitor"];

export function EmptyState({ name, disabled, onPick }: { name: string; disabled: boolean; onPick: (text: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary-text">
        <NexoMark className="h-[18px] w-[18px]" />
      </span>
      <h1 className="font-display text-[30px] leading-tight tracking-[-0.5px]">Olá, {firstName(name)}.</h1>
      <p className="max-w-[460px] text-[15px] leading-relaxed text-ink-3">
        Descreva o que está acontecendo. Eu consulto seus chamados, busco na central de ajuda e chamo um analista quando precisar.
      </p>
      <div className="flex flex-wrap justify-center gap-2 pt-1">
        {STARTERS.map((starter) => (
          <button
            key={starter}
            type="button"
            disabled={disabled}
            onClick={() => onPick(starter)}
            className="rounded-full border border-rule bg-paper px-3.5 py-2 text-[13.5px] font-medium hover:border-primary hover:text-primary-text disabled:opacity-55"
          >
            {starter}
          </button>
        ))}
      </div>
    </div>
  );
}
