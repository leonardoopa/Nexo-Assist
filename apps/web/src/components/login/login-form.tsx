"use client";

import { ArrowRight, Check, Eye, EyeOff, LoaderCircle, Lock, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";

type Status = { kind: "idle" } | { kind: "submitting" } | { kind: "error"; message: string };

const DEMO_ACCOUNTS = [
  { email: "ana.souza@nexo.com.br", label: "funcionária" },
  { email: "rafael.lima@nexo.com.br", label: "analista" },
];

export function LoginForm() {
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const submitting = status.kind === "submitting";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setStatus({ kind: "submitting" });
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, remember }),
      });
      const payload = (await response.json().catch(() => null)) as {
        redirectTo?: string;
        error?: { message?: string };
      } | null;
      if (response.ok && payload?.redirectTo) {
        router.replace(payload.redirectTo);
        router.refresh();
        return; // keep the loading state until the next page takes over
      }
      setStatus({ kind: "error", message: payload?.error?.message ?? "Não foi possível entrar. Tente de novo." });
    } catch {
      setStatus({ kind: "error", message: "Sem conexão com o servidor. Confira sua rede e tente de novo." });
    }
  }

  function fillDemo(account: string) {
    setEmail(account);
    setPassword((current) => current || "demonstracao");
    setStatus({ kind: "idle" });
  }

  const failed = status.kind === "error";

  return (
    <form onSubmit={submit} noValidate className="flex w-full max-w-[380px] flex-col gap-7">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-[40px] leading-[1.1] tracking-[-0.8px]">Entrar</h2>
        <p className="text-[15.5px] leading-normal text-ink-3">Use seu e-mail corporativo e a senha da rede Nexo.</p>
      </div>

      <div className="flex flex-col gap-[18px]">
        <Field label="E-mail corporativo" htmlFor={emailId}>
          <Mail className="size-4 shrink-0 text-ink-3 group-focus-within:text-primary-text" aria-hidden="true" />
          <input
            id={emailId}
            type="email"
            inputMode="email"
            autoComplete="username"
            autoFocus
            required
            placeholder="nome.sobrenome@nexo.com.br"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={failed}
            aria-describedby={failed ? errorId : undefined}
            className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-ink-3/60"
          />
        </Field>

        <Field
          label="Senha"
          htmlFor={passwordId}
          aside={
            <button type="button" className="text-[13.5px] font-medium text-primary-text hover:underline">
              Esqueci minha senha
            </button>
          }
        >
          <Lock className="size-4 shrink-0 text-ink-3 group-focus-within:text-primary-text" aria-hidden="true" />
          <input
            id={passwordId}
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder="Sua senha"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={failed}
            aria-describedby={failed ? errorId : undefined}
            className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-ink-3/60"
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={showPassword}
            className="flex size-[30px] shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-desk"
          >
            {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          </button>
        </Field>

        <label className="flex cursor-pointer items-center gap-[9px] pt-0.5 text-[13.5px] text-ink-2">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="peer sr-only"
          />
          <span className="flex size-[18px] items-center justify-center rounded-md border border-ink/25 bg-paper text-white peer-checked:border-cta peer-checked:bg-cta peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cta">
            {remember ? <Check className="size-3" strokeWidth={3} aria-hidden="true" /> : null}
          </span>
          Manter conectado neste computador
        </label>
      </div>

      {failed ? (
        <p id={errorId} role="alert" className="rounded-lg bg-danger-soft px-3.5 py-2.5 text-[13.5px] text-danger-text">
          {status.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="flex h-11 items-center justify-center gap-2 rounded-lg bg-cta text-[15.5px] font-semibold text-white shadow-[0_1px_2px_rgb(0_98_196/0.2),0_4px_12px_rgb(0_98_196/0.2)] transition-colors hover:bg-cta-hover disabled:cursor-wait disabled:opacity-80"
      >
        {submitting ? (
          <>
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Entrando…
          </>
        ) : (
          <>
            Entrar
            <ArrowRight className="size-4" aria-hidden="true" />
          </>
        )}
      </button>

      <p className="border-t border-rule pt-4 text-[12.5px] leading-relaxed text-ink-3">
        Ambiente de demonstração, qualquer senha vale. Entre como{" "}
        {DEMO_ACCOUNTS.map((account, index) => (
          <span key={account.email}>
            {index > 0 ? " ou " : null}
            <button
              type="button"
              onClick={() => fillDemo(account.email)}
              className="font-semibold text-primary-text hover:underline"
            >
              {account.email}
            </button>{" "}
            ({account.label})
          </span>
        ))}
        .
      </p>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  aside,
  children,
}: {
  label: string;
  htmlFor: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor={htmlFor} className="text-[13.5px] font-medium">
          {label}
        </label>
        {aside}
      </div>
      <div className="group flex h-11 items-center gap-2.5 rounded-lg border border-ink/12 bg-paper pl-3.5 pr-2 shadow-[0_1px_2px_rgb(27_36_49/0.04)] focus-within:border-cta focus-within:ring-4 focus-within:ring-cta/10">
        {children}
      </div>
    </div>
  );
}
