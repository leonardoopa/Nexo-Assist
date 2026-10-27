import { redirect } from "next/navigation";

import { getSession } from "@/server/auth/dal";
import { homeFor } from "@/server/session";

export default async function Home() {
  const session = await getSession();
  redirect(session ? homeFor(session.role) : "/login");
}
