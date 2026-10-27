import type { ReactNode } from "react";

import { AnalystShell } from "@/components/shell/analyst-shell";
import { requireSession } from "@/server/auth/dal";
import { getConversations } from "@/server/conversations";

export default async function AnalystLayout({ children }: { children: ReactNode }) {
  const session = await requireSession("analyst");
  const counts = getConversations().consoleCounts(session.email);
  return (
    <AnalystShell session={session} pending={counts.for_you}>
      {children}
    </AnalystShell>
  );
}
