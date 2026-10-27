import { LogOut, MessagesSquare } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { NexoMark } from "@/components/brand/nexo-mark";
import { initials } from "@/lib/format";
import type { Session } from "@/server/session";

/** Narrow rail of the analyst console; `pending` is how many conversations wait for a person. */
export function AnalystShell({ session, pending, children }: { session: Session; pending: number; children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-paper">
      <aside className="flex w-16 flex-none flex-col items-center gap-2 border-r border-rule py-4">
        <NexoMark className="mb-4 h-5 w-5 text-[#037af6]" />
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

        <div className="flex-1" />

        <span
          title={`${session.name}${session.supportGroup ? ` · Suporte ${session.supportGroup}` : ""}`}
          className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-[12px] font-bold text-primary-text"
        >
          {initials(session.name)}
        </span>
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            aria-label="Sair"
            className="flex size-9 items-center justify-center rounded-lg text-ink-3 hover:bg-desk"
          >
            <LogOut className="size-4" aria-hidden="true" />
          </button>
        </form>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
