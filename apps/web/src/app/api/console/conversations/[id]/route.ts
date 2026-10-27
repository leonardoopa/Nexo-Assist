import { NextResponse, type NextRequest } from "next/server";

import { requireAnalyst } from "@/server/auth/request";
import { getConsoleDeps } from "@/server/console/deps";
import { loadConsoleDetail } from "@/server/console/load";
import { jsonError } from "@/server/http";

/** One conversation with its messages, the decisions behind the agent's answers and the employee's tickets. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAnalyst(request);
  if ("response" in auth) return auth.response;

  const { id } = await context.params;
  const { email, name } = auth.session;
  const detail = await loadConsoleDetail(getConsoleDeps(), { email, name }, id);
  if (!detail) return jsonError("conversation_not_found", "Conversa não encontrada.", 404);
  return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } });
}
