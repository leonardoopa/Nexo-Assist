import { MessagesSquare, UserRound } from "lucide-react";
import type { ReactNode } from "react";

import { NexoMark } from "@/components/brand/nexo-mark";
import { initials } from "@/lib/format";
import type { Session } from "@/server/session";

import { NavLink } from "./nav-link";
import { SignOutButton } from "./sign-out-button";

/** Sidebar on desktop; on small screens the same blocks stack above the page. */
export function EmployeeShell({ session, children }: { session: Session; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper md:flex-row">
      <aside className="flex flex-none flex-col border-b border-rule px-4 py-3 md:sticky md:top-0 md:h-screen md:w-[232px] md:border-b-0 md:border-r md:px-3.5 md:pb-3.5 md:pt-5">
        <div className="flex items-center gap-2.5 px-2">
          <NexoMark className="h-5 w-5 text-[#037af6]" />
          <span className="text-base font-bold tracking-[-0.2px]">Nexo Assist</span>
        </div>

        <nav aria-label="Principal" className="mt-3 flex gap-1 md:mt-[22px] md:flex-col md:gap-0.5">
          <NavLink href="/chat" icon={<MessagesSquare className="size-4" aria-hidden="true" />}>
            Atendimento
          </NavLink>
          <NavLink href="/profile" icon={<UserRound className="size-4" aria-hidden="true" />}>
            Meu perfil
          </NavLink>
        </nav>

        <div className="hidden flex-1 md:block" />

        <div className="mt-3 flex items-center gap-2.5 border-t border-rule px-2 pb-1 pt-3.5">
          <span className="flex size-[34px] flex-none items-center justify-center rounded-full bg-primary-soft text-[12.5px] font-bold text-primary-text">
            {initials(session.name)}
          </span>
          <span className="flex min-w-0 flex-col gap-px">
            <span className="truncate text-[13.5px] font-semibold">{session.name}</span>
            <span className="truncate text-[11.5px] text-ink-3">{session.email}</span>
          </span>
        </div>
        <SignOutButton />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
