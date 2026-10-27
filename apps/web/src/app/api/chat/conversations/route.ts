import { NextResponse, type NextRequest } from "next/server";

import { getAgentRuntime } from "@/server/agent";
import { supersedePendingDrafts } from "@/server/agent/drafts";
import { requireEmployee } from "@/server/auth/request";
import { toConversationView } from "@/server/chat/view";
import { isSameOrigin, jsonError } from "@/server/http";

/** Starts a fresh conversation, e.g. when the current session hit its message limit. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("forbidden_origin", "Origem não permitida.", 403);
  const auth = await requireEmployee(request);
  if ("response" in auth) return auth.response;
  const { session } = auth;

  const runtime = getAgentRuntime();
  const { conversations, serviceDesk } = runtime.deps;

  const open = conversations.findOpen(session.email);
  if (open) {
    if (open.status !== "agent") {
      return jsonError("with_analyst", "Sua conversa está com um analista. Aguarde o atendimento antes de começar outra.", 409);
    }
    supersedePendingDrafts({ deps: runtime.deps, conversationId: open.id });
    conversations.close(open.id, "agent");
  }

  const profile = await serviceDesk.getUser(session.email).catch(() => null);
  const { conversation } = conversations.resumeOrStart({ email: session.email, name: session.name, department: profile?.department ?? null });
  return NextResponse.json({ conversation: toConversationView(conversation, conversations.messageLimit) }, { status: 201 });
}
