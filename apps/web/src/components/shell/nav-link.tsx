"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] ${
        active ? "bg-primary-soft font-semibold text-primary-text" : "font-medium text-ink-2 hover:bg-desk"
      }`}
    >
      <span className={active ? "text-primary-text" : "text-ink-3"}>{icon}</span>
      {children}
    </Link>
  );
}
