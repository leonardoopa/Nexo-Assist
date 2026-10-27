import type { ReactNode } from "react";

import { EmployeeShell } from "@/components/shell/employee-shell";
import { requireSession } from "@/server/auth/dal";

export default async function EmployeeLayout({ children }: { children: ReactNode }) {
  const session = await requireSession("employee");
  return <EmployeeShell session={session}>{children}</EmployeeShell>;
}
