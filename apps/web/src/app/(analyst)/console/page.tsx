import type { Metadata } from "next";

import { ConsoleApp } from "@/components/console/console-app";
import { requireSession } from "@/server/auth/dal";
import { getConsoleDeps } from "@/server/console/deps";
import { listConsole, loadConsoleDetail } from "@/server/console/load";

export const metadata: Metadata = { title: "Conversas" };

export default async function ConsolePage({ searchParams }: { searchParams: Promise<{ c?: string | string[] }> }) {
  const session = await requireSession("analyst");
  const { c } = await searchParams;
  const analyst = { email: session.email, name: session.name };
  const deps = getConsoleDeps();

  // `?c=` keeps the open conversation across a reload; an id that no longer exists just opens the list.
  const initialDetail = typeof c === "string" && c ? await loadConsoleDetail(deps, analyst, c) : null;

  return <ConsoleApp me={analyst} initialList={listConsole(deps, analyst, { tab: "all" })} initialDetail={initialDetail} />;
}
