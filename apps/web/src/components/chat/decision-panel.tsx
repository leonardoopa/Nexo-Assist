import { ChevronDown, Info, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { formatUntil } from "@/lib/format";
import { HANDOFF_REASON_LABEL, INTENT_LABEL } from "@/lib/labels";
import type { DecisionRecord } from "@/server/agent/decision";

const LEVEL: Record<DecisionRecord["confidence"]["level"], { label: string; tone: string; bar: string }> = {
  alta: { label: "alta", tone: "bg-success-soft text-success-text", bar: "bg-success" },
  media: { label: "média", tone: "bg-warning-soft text-warning-text", bar: "bg-warning" },
  baixa: { label: "baixa", tone: "bg-danger-soft text-danger-text", bar: "bg-danger" },
};

const FACTOR_MARK = { raises: "↑", lowers: "↓", neutral: "·" } as const;
const FACTOR_TONE = { raises: "text-success-text", lowers: "text-danger-text", neutral: "text-ink-3" } as const;

const percent = (score: number) => `${Math.round(score * 100)}%`;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h4 className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">{title}</h4>
      {children}
    </section>
  );
}

/**
 * The answer's explanation, one tap away: what the agent understood, what it did and why, how
 * sure it was and what that rests on, which rules applied (and which the system checked itself),
 * every step it took, and anything that stepped in to correct it.
 */
export function DecisionDetails({ decision }: { decision: DecisionRecord }) {
  const level = LEVEL[decision.confidence.level];
  return (
    <details className="group max-w-[720px] text-[12.5px] text-ink-3">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-md py-0.5 hover:text-ink-2 [&::-webkit-details-marker]:hidden">
        <span className={`rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold ${level.tone}`}>
          Segurança {level.label} · {percent(decision.confidence.score)}
        </span>
        <span>Como decidi</span>
        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>

      <div className="mt-2 flex flex-col gap-4 rounded-xl border border-rule bg-paper p-4 text-[13px] leading-normal text-ink-2">
        <Section title="O que entendi">
          <p>
            <span className="mr-1.5 rounded bg-desk px-1.5 py-0.5 text-[11.5px] font-medium text-ink-3">{INTENT_LABEL[decision.intent]}</span>
            {decision.understanding}
          </p>
        </Section>

        <Section title="O que fiz">
          <p>{decision.action}</p>
        </Section>

        <Section title="Por quê">
          <p>{decision.rationale}</p>
        </Section>

        <Section title="Segurança">
          <div className="flex items-center gap-2.5">
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-desk" role="img" aria-label={`Segurança ${level.label}, ${percent(decision.confidence.score)}`}>
              <div className={`h-full rounded-full ${level.bar}`} style={{ width: percent(decision.confidence.score) }} />
            </div>
            <span className="font-medium">{percent(decision.confidence.score)}</span>
          </div>
          <ul className="flex flex-col gap-0.5">
            {decision.confidence.factors.map((factor) => (
              <li key={factor.label} className="flex gap-2">
                <span className={`w-3 flex-none text-center font-semibold ${FACTOR_TONE[factor.effect]}`} aria-hidden="true">
                  {FACTOR_MARK[factor.effect]}
                </span>
                {factor.label}
              </li>
            ))}
          </ul>
        </Section>

        {decision.rules.length > 0 ? (
          <Section title="Regras do service desk">
            <ul className="flex flex-col gap-1">
              {decision.rules.map((rule) => (
                <li key={rule.id} className="flex items-start gap-2">
                  {rule.verified ? (
                    <ShieldCheck className="mt-0.5 size-3.5 flex-none text-success-text" aria-label="Verificada pelo sistema" />
                  ) : (
                    <Info className="mt-0.5 size-3.5 flex-none text-ink-3" aria-label="Declarada pelo agent, não verificada" />
                  )}
                  <span>
                    {rule.label}
                    <span className="text-ink-3"> · {rule.verified ? "verificada pelo sistema" : "declarada pelo agent"}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {decision.steps.length > 0 ? (
          <Section title="Passos">
            <ol className="flex flex-col gap-1">
              {decision.steps.map((step) => (
                <li key={step.id} className="flex items-baseline gap-2">
                  <span className={`flex-none font-medium ${step.status === "error" ? "text-warning-text" : "text-ink"}`}>{step.label}</span>
                  <span className="min-w-0 flex-1">{step.summary}</span>
                  <span className="flex-none text-ink-3">{step.durationMs} ms</span>
                </li>
              ))}
            </ol>
          </Section>
        ) : null}

        {decision.guardrails.length > 0 ? (
          <Section title="Proteções acionadas">
            <ul className="flex flex-col gap-0.5">
              {decision.guardrails.map((guardrail) => (
                <li key={guardrail.id}>{guardrail.detail}</li>
              ))}
            </ul>
          </Section>
        ) : null}

        {decision.handoff ? (
          <Section title="Transferência">
            <p>
              {HANDOFF_REASON_LABEL[decision.handoff.reason]} · Suporte {decision.handoff.group}
              {decision.handoff.ticketId ? ` · ${decision.handoff.ticketId}` : ""}
              {decision.handoff.respondBy ? ` · resposta ${formatUntil(decision.handoff.respondBy)}` : ""}
              {decision.handoff.auto ? " · decidida pelo agent por falta de segurança" : ""}
            </p>
          </Section>
        ) : null}

        {decision.usage ? (
          <p className="border-t border-rule pt-2 text-[12px] text-ink-3">
            {decision.usage.model} · {decision.usage.inputTokens} tokens de entrada e {decision.usage.outputTokens} de saída ·{" "}
            {(decision.usage.latencyMs / 1000).toFixed(1)} s · {decision.usage.modelSteps} chamada(s) ao modelo
          </p>
        ) : null}
      </div>
    </details>
  );
}
