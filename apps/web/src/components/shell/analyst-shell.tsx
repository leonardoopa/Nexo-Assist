import { LogOut } from "lucide-react";
import type { ReactNode } from "react";

import { NexoMark } from "@/components/brand/nexo-mark";
import { initials } from "@/lib/format";
import type { Session } from "@/server/session";

import { ConsoleNavLink } from "./console-nav-link";

/**
 * Narrow rail of the analyst console; `pending` is how many conversations wait for a person.
 * The console fills the screen and scrolls inside its own columns, so the page itself does not scroll.
 */
export function AnalystShell({ session, pending, children }: { session: Session; pending: number; children: ReactNode }) {
  return (
    <div className="flex h-dvh bg-paper">
      <aside className="flex w-16 flex-none flex-col items-center gap-2 border-r border-rule py-4">
        <NexoMark className="mb-4 h-5 w-5 text-[#037af6]" />
        <ConsoleNavLink initial={pending} />

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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
