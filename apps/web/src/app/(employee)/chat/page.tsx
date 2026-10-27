import type { Metadata } from "next";

import { ChatApp } from "@/components/chat/chat-app";
import { StatusChip, TopBar } from "@/components/shell/top-bar";
import { requireSession } from "@/server/auth/dal";
import { getChatDeps } from "@/server/chat/deps";
import { loadChat } from "@/server/chat/load";

export const metadata: Metadata = { title: "Atendimento" };

export default async function ChatPage() {
  const session = await requireSession("employee");
  const deps = getChatDeps();

  return (
    <>
      <TopBar section="Atendimento">
        <StatusChip>Assistente online</StatusChip>
      </TopBar>
      <ChatApp initial={loadChat(deps, session.email)} employeeName={session.name} messageLimit={deps.conversations.messageLimit} />
    </>
  );
}
