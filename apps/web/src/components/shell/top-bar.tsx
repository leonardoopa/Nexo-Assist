import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export function TopBar({ section, children }: { section: string; children?: ReactNode }) {
  return (
    <header className="flex h-16 flex-none items-center gap-4 border-b border-rule px-5 md:px-8">
      <nav aria-label="Você está em" className="flex min-w-0 flex-1 items-center gap-2 text-[13.5px]">
        <span className="text-ink-3">Service desk de TI</span>
        <ChevronRight className="size-3.5 text-ink-3" aria-hidden="true" />
        <span className="truncate font-semibold">{section}</span>
      </nav>
      {children}
    </header>
  );
}

export function StatusChip({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-[7px] rounded-full bg-success-soft px-2.5 py-[5px] text-[12.5px] font-semibold text-success-text">
      <span className="size-[7px] rounded-full bg-success" aria-hidden="true" />
      {children}
    </span>
  );
}
