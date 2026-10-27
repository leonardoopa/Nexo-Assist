import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireAnalyst } from "@/server/auth/request";
import { getConsoleDeps } from "@/server/console/deps";
import { listConsole } from "@/server/console/load";
import { jsonError } from "@/server/http";

const querySchema = z.object({
  tab: z.enum(["all", "for_you", "agent", "mine"]).default("all"),
  q: z.string().trim().max(100).optional(),
});

/** The analyst's conversation list for one tab, with the count of every tab. */
export async function GET(request: NextRequest) {
  const auth = await requireAnalyst(request);
  if ("response" in auth) return auth.response;

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return jsonError("invalid_input", "Filtro inválido.", 400);

  const { email, name } = auth.session;
  const list = listConsole(getConsoleDeps(), { email, name }, { tab: parsed.data.tab, search: parsed.data.q });
  return NextResponse.json(list, { headers: { "Cache-Control": "no-store" } });
}
