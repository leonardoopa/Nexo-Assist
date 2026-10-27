"use client";

import { useState } from "react";

/** Simulated: this environment has no mail server, so it only shows what would happen. */
export function ResetPassword({ email }: { email: string }) {
  const [sent, setSent] = useState(false);

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => setSent(true)}
        disabled={sent}
        className="h-9 rounded-lg border border-ink/15 bg-paper px-3.5 text-[13.5px] font-semibold hover:bg-desk disabled:cursor-default disabled:opacity-60"
      >
        Redefinir senha
      </button>
      <p aria-live="polite" className="text-[12.5px] text-ink-3">
        {sent
          ? `Link de redefinição enviado para ${email} (simulado neste ambiente).`
          : `Enviaremos um link de redefinição para ${email}.`}
      </p>
    </div>
  );
}
