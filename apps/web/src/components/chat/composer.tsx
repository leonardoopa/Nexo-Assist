"use client";

import { SendHorizontal } from "lucide-react";
import { useState, type KeyboardEvent, type RefObject } from "react";

interface ComposerProps {
  disabled: boolean;
  placeholder: string;
  counter: string;
  /** A line above the field, e.g. what to write after pressing Editar. */
  hint: string | null;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onSend: (text: string) => void;
}

/** Enter sends, Shift+Enter breaks the line. The counter shows how much of the session's message limit is used. */
export function Composer({ disabled, placeholder, counter, hint, inputRef, onSend }: ComposerProps) {
  const [text, setText] = useState("");

  const submit = () => {
    const value = text.trim();
    if (!value || disabled) return;
    onSend(value);
    setText("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
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
      <p className="text-right text-[12.5px] text-ink-3">{counter}</p>
    </form>
  );
}
