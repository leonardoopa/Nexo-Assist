import { NextResponse, type NextRequest } from "next/server";

import { requireAnalyst } from "@/server/auth/request";
import { consoleActionSchema, describeConsoleError, runConsoleAction } from "@/server/console/actions";
import { getConsoleDeps } from "@/server/console/deps";
import { loadConsoleDetail } from "@/server/console/load";
import type { ConsoleActionResult } from "@/server/console/view";
import { ConversationError } from "@/server/conversations/errors";
import { isSameOrigin, jsonError } from "@/server/http";

/** Assume, answer, return to the agent or close a conversation. The answer is the conversation as it is afterwards. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return jsonError("forbidden_origin", "Origem não permitida.", 403);
  const auth = await requireAnalyst(request);
  if ("response" in auth) return auth.response;

  const parsed = consoleActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("invalid_input", "Ação inválida. Uma resposta tem de 1 a 2000 caracteres.", 400);

  const { id } = await context.params;
  const { email, name } = auth.session;
  const analyst = { email, name };
  const deps = getConsoleDeps();

  try {
    const { notice } = await runConsoleAction(deps, analyst, id, parsed.data);
    const detail = await loadConsoleDetail(deps, analyst, id);
    if (!detail) return jsonError("conversation_not_found", "Conversa não encontrada.", 404);
    const result: ConsoleActionResult = { detail, notice };
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ConversationError) {
      const { status, code, message } = describeConsoleError(error, parsed.data);
      return jsonError(code, message, status);
    }
    throw error;
  }
}
