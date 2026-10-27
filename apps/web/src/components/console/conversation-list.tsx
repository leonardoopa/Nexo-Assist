"use client";

import { Search } from "lucide-react";

import { formatListTime, initials } from "@/lib/format";
import type { ConsoleItem, ConsoleList } from "@/server/console/view";
import type { ConsoleTab } from "@/server/conversations/types";

import { itemStatus, previewOf, type Tone } from "./view-model";

const TABS: Array<{ key: ConsoleTab; label: string }> = [
  { key: "all", label: "Todas" },
  { key: "for_you", label: "Para você" },
  { key: "agent", label: "Com o agent" },
  { key: "mine", label: "Minhas" },
];

const TONE_TEXT: Record<Tone, string> = {
  warning: "text-warning-text",
  info: "text-primary-text",
  neutral: "text-ink-3",
  success: "text-success-text",
  danger: "text-danger-text",
};

const EMPTY: Record<ConsoleTab, string> = {
  all: "Nenhuma conversa por enquanto.",
  for_you: "Nenhuma conversa aguardando um analista.",
  agent: "O agent não está atendendo ninguém agora.",
  mine: "Você ainda não assumiu nenhuma conversa.",
};

interface ConversationListProps {
  className: string;
  me: string;
  now: Date;
  tab: ConsoleTab;
  search: string;
  list: ConsoleList;
  selectedId: string | null;
  /** The list could not be refreshed: what is shown may be out of date. */
  stale: boolean;
  onTab: (tab: ConsoleTab) => void;
  onSearch: (search: string) => void;
  onSelect: (id: string) => void;
}

/** The first column: what is waiting, what the agent has, what is mine, with a search over names and ticket numbers. */
export function ConversationList({ className, me, now, tab, search, list, selectedId, stale, onTab, onSearch, onSelect }: ConversationListProps) {
  return (
    <section aria-label="Lista de conversas" className={`${className} w-full flex-none flex-col border-r border-rule bg-paper lg:w-[344px]`}>
      <div className="flex flex-col gap-3 px-4 pb-0 pt-4">
        <h1 className="font-display text-[26px] leading-none tracking-[-0.5px]">Conversas</h1>
        <label className="flex h-9 items-center gap-2 rounded-lg border border-rule bg-desk px-3 focus-within:border-cta focus-within:bg-paper">
          <Search className="size-3.5 flex-none text-ink-3" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Pesquisar conversa ou chamado"
            aria-label="Pesquisar conversa ou chamado"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-ink-3"
          />
        </label>
        <div role="tablist" aria-label="Filtro de conversas" className="-mx-2 flex overflow-x-auto border-b border-rule [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map(({ key, label }) => {
            const active = key === tab;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onTab(key)}
                className={`flex flex-none items-center gap-1 border-b-2 px-1.5 pb-2.5 pt-1 text-[13px] ${
                  active ? "border-cta font-semibold text-ink" : "border-transparent font-medium text-ink-3 hover:text-ink-2"
                }`}
              >
                {label}
                {key !== "all" ? (
                  <span
                    className={`rounded-full px-1.5 text-[11.5px] font-semibold leading-[18px] ${
                      key === "for_you" && list.counts.for_you > 0 ? "bg-cta text-white" : "bg-desk text-ink-3"
                    }`}
                  >
                    {list.counts[key]}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {stale ? (
        <p role="status" className="bg-warning-soft px-4 py-2 text-[12.5px] text-warning-text">
          Sem conexão: a lista pode estar desatualizada.
        </p>
      ) : null}

      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto">
        {list.items.length === 0 ? (
          <p className="px-6 py-10 text-center text-[13.5px] leading-normal text-ink-3">
            {search.trim() ? `Nenhuma conversa encontrada para “${search.trim()}”.` : EMPTY[tab]}
          </p>
        ) : (
          <ul>
            {list.items.map((item) => (
              <ConversationRow key={item.id} item={item} me={me} now={now} selected={item.id === selectedId} onSelect={onSelect} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ConversationRow({ item, me, now, selected, onSelect }: { item: ConsoleItem; me: string; now: Date; selected: boolean; onSelect: (id: string) => void }) {
  const status = itemStatus(item, me, now);
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(item.id)}
        aria-current={selected ? "true" : undefined}
        className={`flex w-full gap-3 border-b border-rule px-4 py-3 text-left ${selected ? "bg-primary-soft" : "hover:bg-desk"}`}
      >
        <span className="flex size-9 flex-none items-center justify-center rounded-full bg-desk text-[12px] font-bold text-ink-2 ring-1 ring-rule" aria-hidden="true">
          {initials(item.employee.name)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{item.employee.name}</span>
            <span className="flex-none text-[12px] text-ink-3">{formatListTime(item.lastMessage?.at ?? item.updatedAt, now)}</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">{previewOf(item, me)}</span>
            {item.analystUnread > 0 ? (
              <span
                className="flex min-w-[18px] flex-none items-center justify-center rounded-full bg-cta px-1 text-[11px] font-bold leading-[18px] text-white"
                aria-label={`${item.analystUnread} não lida${item.analystUnread > 1 ? "s" : ""}`}
              >
                {item.analystUnread}
              </span>
            ) : null}
          </span>
          <span className={`truncate text-[12px] font-medium ${TONE_TEXT[status.tone]}`}>{status.text}</span>
        </span>
      </button>
    </li>
  );
}
