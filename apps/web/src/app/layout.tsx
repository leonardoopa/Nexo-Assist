import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@fontsource-variable/newsreader";
import "@fontsource-variable/schibsted-grotesk";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Nexo Assist", template: "%s · Nexo Assist" },
  description: "Atendimento do service desk de TI da Nexo, em uma conversa.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
