"use client";

import { MessagesSquare } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const PENDING_EVENT = "nexo:pending";

/** The console tells the rail how many conversations wait for a person, so the badge never lags behind the list. */
export function announcePending(count: number): void {
  window.dispatchEvent(new CustomEvent<number>(PENDING_EVENT, { detail: count }));
}

/** The rail's link to the console, with the number of conversations waiting for an analyst. */
export function ConsoleNavLink({ initial }: { initial: number }) {
  const [pending, setPending] = useState(initial);

  useEffect(() => {
    const onPending = (event: Event) => setPending((event as CustomEvent<number>).detail);
    window.addEventListener(PENDING_EVENT, onPending);
    return () => window.removeEventListener(PENDING_EVENT, onPending);
  }, []);

  return (
    <Link
      href="/console"
      aria-current="page"
      aria-label={pending > 0 ? `Conversas, ${pending} aguardando` : "Conversas"}
      className="relative flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary-text"
    >
      <MessagesSquare className="size-[18px]" aria-hidden="true" />
      {pending > 0 ? (
        <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-cta px-1 text-[10px] font-bold leading-4 text-white">
          {pending}
        </span>
      ) : null}
    </Link>
  );
}
