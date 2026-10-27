"use client";

import { SendHorizontal } from "lucide-react";
import { useState, type KeyboardEvent, type RefObject } from "react";

interface ComposerProps {
  disabled: boolean;
  placeholder: string;
  /** The line under the field, e.g. how much of the session's message limit is used. */
  counter?: string;
  /** A line above the field, e.g. what to write after pressing Editar. */
  hint?: string | null;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  /** Answer `false` (now or later) when the text could not be sent, so it comes back into the field instead of being lost. */
  onSend: (text: string) => void | boolean | Promise<boolean | void>;
}

/** Enter sends, Shift+Enter breaks the line. */
export function Composer({ disabled, placeholder, counter, hint, inputRef, onSend }: ComposerProps) {
  const [text, setText] = useState("");

  const submit = async () => {
    const value = text.trim();
    if (!value || disabled) return;
    setText("");
    const accepted = await onSend(value);
    // Anything typed in the meantime stays; the text that failed only returns to an empty field.
    if (accepted === false) setText((current) => current || value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-1.5"
    >
      {hint ? <p className="text-[12.5px] font-medium text-primary-text">{hint}</p> : null}
      <div className="flex items-end gap-2 rounded-xl border border-ink/12 bg-paper py-1.5 pl-4 pr-1.5 shadow-[0_1px_2px_rgb(27_36_49/0.04)] focus-within:border-cta focus-within:ring-4 focus-within:ring-cta/10">
        <textarea
          ref={inputRef}
          rows={Math.min(5, Math.max(1, text.split("\n").length))}
          maxLength={2000}
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          aria-label="Mensagem"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[14.5px] leading-normal outline-none placeholder:text-ink-3 disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="flex h-9 flex-none items-center gap-1.5 rounded-md bg-cta px-3 text-[13.5px] font-semibold text-white hover:bg-cta-hover disabled:opacity-50"
        >
          <SendHorizontal className="size-3.5" aria-hidden="true" />
          Enviar
        </button>
      </div>
      {counter ? <p className="text-right text-[12.5px] text-ink-3">{counter}</p> : null}
    </form>
  );
}
