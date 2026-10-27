import type { TurnContext } from "./context";

/** The phrases shown above an answer: "consultou seus chamados". The running form is what shows while it happens. */
const LABELS: Record<string, { done: string; running: string }> = {
  list_my_tickets: { done: "consultou seus chamados", running: "consultando seus chamados" },
  search_help_center: { done: "buscou na central de ajuda", running: "buscando na central de ajuda" },
  classify_priority: { done: "classificou a prioridade", running: "classificando a prioridade" },
  get_sla: { done: "consultou o SLA", running: "consultando o SLA" },
  calculate_deadline: { done: "calculou o prazo", running: "calculando o prazo" },
  check_duplicates: { done: "verificou duplicidade", running: "verificando duplicidade" },
  draft_ticket: { done: "montou o rascunho", running: "montando o rascunho" },
  draft_ticket_update: { done: "montou a atualização", running: "montando a atualização" },
  draft_reopen_ticket: { done: "montou a reabertura", running: "montando a reabertura" },
  transfer_to_analyst: { done: "chamou um analista", running: "chamando um analista" },
  create_ticket: { done: "criou o chamado", running: "criando o chamado" },
  add_update: { done: "atualizou o chamado", running: "atualizando o chamado" },
  reopen_ticket: { done: "reabriu o chamado", running: "reabrindo o chamado" },
  cancel_draft: { done: "cancelou o rascunho", running: "cancelando o rascunho" },
};

export function stepLabels(tool: string, subject?: string): { done: string; running: string } {
  if (tool === "get_ticket") {
    const target = subject ? ` ${subject}` : "";
    return { done: `consultou o${target ? target : " chamado"}`, running: `consultando o${target ? target : " chamado"}` };
  }
  const known = LABELS[tool];
  if (!known) return { done: tool, running: tool };
  return subject ? { done: `${known.done} ${subject}`, running: `${known.running} ${subject}` } : known;
}

export interface StepSpec {
  tool: string;
  /** Appended to the label, e.g. the ticket number. */
  subject?: string;
  /** What was asked, kept in the record. Never put secrets or other people's data here. */
  input?: Record<string, unknown>;
}

/**
 * Runs one unit of work as a visible step: the screen hears when it starts and ends, and the
 * decision record keeps what it was, how long it took and how it went.
 */
export async function runStep<T>(
  ctx: TurnContext,
  spec: StepSpec,
  work: () => Promise<T>,
  summarize: (result: T) => string,
): Promise<T> {
  const labels = stepLabels(spec.tool, spec.subject);
  const id = `${spec.tool}-${ctx.trace.length + 1}`;
  const started = performance.now();
  ctx.emit({ type: "step_start", id, tool: spec.tool, label: labels.running });

  const finish = (status: "ok" | "error", summary: string) => {
    const durationMs = Math.round(performance.now() - started);
    ctx.trace.push({ id, tool: spec.tool, label: labels.done, status, durationMs, input: spec.input ?? {}, summary });
    ctx.emit({ type: "step_end", id, tool: spec.tool, label: labels.done, status, summary, durationMs });
  };

  try {
    const result = await work();
    finish("ok", summarize(result));
    return result;
  } catch (error) {
    finish("error", error instanceof Error ? error.message : "Falhou");
    throw error;
  }
}
