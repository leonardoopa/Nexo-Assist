"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { announcePending } from "@/components/shell/console-nav-link";
import type { ConsoleDetail, ConsoleList } from "@/server/console/view";
import type { ConsoleTab } from "@/server/conversations/types";

import { fetchConsoleDetail, fetchConsoleList, postConsoleAction, type ConsoleActionBody } from "./console-client";
import { ConversationList } from "./conversation-list";
import { ConversationPane, EmptyPane, type Feedback } from "./conversation-pane";
import { TicketsPanel } from "./tickets-panel";
import { ticketsOverview } from "./view-model";

const POLL_MS = 5000;
const SEARCH_DELAY_MS = 300;

interface ConsoleAppProps {
  me: { email: string; name: string };
  initialList: ConsoleList;
  initialDetail: ConsoleDetail | null;
}

/**
 * The analyst's side. It keeps the list and the open conversation fresh (the employee and the agent
 * keep writing while the analyst reads), and turns the analyst's clicks into the actions the server
 * allows: assume, answer, give back to the agent, close.
 */
export function ConsoleApp({ me, initialList, initialDetail }: ConsoleAppProps) {
  const router = useRouter();
  const [tab, setTab] = useState<ConsoleTab>("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [list, setList] = useState(initialList);
  const [stale, setStale] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialDetail?.conversation.id ?? null);
  const [detail, setDetail] = useState(initialDetail);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [acting, setActing] = useState<ConsoleActionBody["type"] | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [now, setNow] = useState(() => new Date());
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const focusComposer = useRef(false);
  const markedRead = useRef("");
  // What the async loaders compare against when their answer arrives, to drop answers about something the analyst has left.
  const latest = useRef({ tab, query, selectedId, writes: 0 });
  useEffect(() => {
    latest.current = { ...latest.current, tab, query, selectedId };
  }, [tab, query, selectedId]);

  const expired = useCallback(() => router.replace("/login"), [router]);

  const refreshList = useCallback(async () => {
    const asked = { tab: latest.current.tab, query: latest.current.query };
    const result = await fetchConsoleList(asked.tab, asked.query);
    if (!result.ok) {
      if (result.status === 401) expired();
      else setStale(true);
      return;
    }
    announcePending(result.data.counts.for_you);
    if (latest.current.tab !== asked.tab || latest.current.query !== asked.query) return;
    setList(result.data);
    setStale(false);
    setNow(new Date());
  }, [expired]);

  /** `opening` is the first load of a conversation: only then is a failure worth showing, a failed refresh keeps what is on screen. */
  const refreshDetail = useCallback(
    async (id: string, opening = false) => {
      const writesBefore = latest.current.writes;
      const result = await fetchConsoleDetail(id);
      // The analyst moved on, or acted while this was on its way: this answer is already out of date.
      if (latest.current.selectedId !== id || latest.current.writes !== writesBefore) return;
      if (result.ok) {
        setDetail(result.data);
        setProblem(null);
      } else if (result.status === 401) {
        expired();
      } else if (result.status === 404) {
        setDetail(null);
        setProblem("Esta conversa não existe mais.");
      } else if (opening) {
        setProblem(result.message);
      }
    },
    [expired],
  );

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      setDetail(null);
      setProblem(null);
      setFeedback(null);
      setLoadingDetail(id !== null);
      window.history.replaceState(null, "", id ? `/console?c=${encodeURIComponent(id)}` : "/console");
      if (id) void refreshDetail(id, true).finally(() => setLoadingDetail(false));
    },
    [refreshDetail],
  );

  // Typing in the search box waits for a pause before asking the server.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // A new filter or search asks for a new list (the first render already has one).
  const firstFilter = useRef(true);
  useEffect(() => {
    if (firstFilter.current) {
      firstFilter.current = false;
      return;
    }
    void refreshList();
  }, [tab, query, refreshList]);

  // The employee and the agent keep writing: look for news while the tab is in front.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return;
      void refreshList();
      if (latest.current.selectedId) void refreshDetail(latest.current.selectedId);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refreshList, refreshDetail]);

  // Reading a conversation clears its unread count, including what arrives while it stays open.
  const selectedItem = list.items.find((item) => item.id === selectedId);
  useEffect(() => {
    if (!selectedItem || selectedItem.analystUnread === 0) return;
    const key = `${selectedItem.id}:${selectedItem.analystUnread}`;
    if (markedRead.current === key) return;
    markedRead.current = key;
    void postConsoleAction(selectedItem.id, { type: "read" }).then(() => refreshList());
  }, [selectedItem, refreshList]);

  const act = useCallback(
    async (body: ConsoleActionBody): Promise<boolean> => {
      const id = latest.current.selectedId;
      if (!id) return false;
      setActing(body.type);
      setFeedback(null);
      latest.current.writes += 1;
      const result = await postConsoleAction(id, body);
      latest.current.writes += 1;
      setActing(null);

      if (result.ok) {
        if (latest.current.selectedId === id) setDetail(result.data.detail);
        if (result.data.notice) setFeedback({ tone: "notice", text: result.data.notice });
        void refreshList();
        if (body.type === "assume") focusComposer.current = true;
        return true;
      }
      if (result.status === 401) {
        expired();
        return false;
      }
      setFeedback({ tone: "error", text: result.message });
      // Most refusals mean the conversation changed under the analyst: show how it is now.
      void refreshDetail(id);
      void refreshList();
      return false;
    },
    [expired, refreshDetail, refreshList],
  );

  // After taking a conversation the next thing to do is answer it: the field is enabled once the new state arrives.
  useEffect(() => {
    if (focusComposer.current && detail?.conversation.status === "with_analyst") {
      focusComposer.current = false;
      composerRef.current?.focus();
    }
  }, [detail]);

  const overview = useMemo(() => (detail ? ticketsOverview(detail.links, detail.tickets) : null), [detail]);
  const showing = detail !== null && detail.conversation.id === selectedId && overview !== null;

  const panel = (className: string) =>
    detail && overview ? (
      <TicketsPanel
        className={className}
        employeeName={detail.conversation.employee.name}
        overview={overview}
        tickets={detail.tickets}
        onRetry={() => void refreshDetail(detail.conversation.id)}
      />
    ) : null;

  return (
    <main className="flex min-h-0 flex-1">
      <ConversationList
        className={selectedId ? "hidden lg:flex" : "flex"}
        me={me.email}
        now={now}
        tab={tab}
        search={search}
        list={list}
        selectedId={selectedId}
        stale={stale}
        onTab={setTab}
        onSearch={setSearch}
        onSelect={select}
      />

      <section aria-label="Conversa aberta" className={`${selectedId ? "flex" : "hidden lg:flex"} min-h-0 min-w-0 flex-1 flex-col`}>
        {showing ? (
          <ConversationPane
            detail={detail}
            me={me}
            now={now}
            acting={acting}
            feedback={feedback}
            composerRef={composerRef}
            tickets={panel("flex")}
            ticketId={overview.fromConversation[0]?.id ?? null}
            onAction={act}
            onDismissFeedback={() => setFeedback(null)}
            onBack={() => select(null)}
          />
        ) : (
          <EmptyPane loading={loadingDetail} problem={problem} />
        )}
      </section>

      {showing ? panel("hidden w-[300px] flex-none border-l border-rule xl:flex") : null}
    </main>
  );
}
