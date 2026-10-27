import { NextResponse, type NextRequest } from "next/server";

import { getAgentRuntime } from "@/server/agent";
import { requireEmployee } from "@/server/auth/request";
import { loadChat } from "@/server/chat/load";

/** The employee's open conversation, to draw the chat when the page loads. */
export async function GET(request: NextRequest) {
  const auth = await requireEmployee(request);
  if ("response" in auth) return auth.response;
  return NextResponse.json(loadChat(getAgentRuntime(), auth.session.email), { headers: { "Cache-Control": "no-store" } });
}
