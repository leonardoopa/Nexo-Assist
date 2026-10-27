import { z } from "zod";

import { supportGroupSchema } from "@/lib/domain";
import { handoffReasonSchema, type HandoffReason } from "@/server/conversations/types";

import type { ConfidenceAssessment, ConfidenceEvidence } from "./policy/confidence";
import { assessConfidence } from "./policy/confidence";

export const intentSchema = z.enum([
  "answer_question",
  "check_ticket",
  "update_ticket",
  "open_ticket",
  "reopen_ticket",
  "ask_missing_info",
  "confirm_action",
  "cancel_action",
  "handoff",
  "out_of_scope",
  "small_talk",
  "unclear",
  "error",
]);
export type Intent = z.infer<typeof intentSchema>;

export const INTENT_LABEL: Record<Intent, string> = {
  answer_question: "Tirar uma dúvida",
  check_ticket: "Consultar chamado",
  update_ticket: "Complementar chamado",
  open_ticket: "Abrir chamado",
  reopen_ticket: "Reabrir chamado",
  ask_missing_info: "Pedir informação que falta",
  confirm_action: "Confirmar ação",
  cancel_action: "Cancelar ação",
  handoff: "Chamar um analista",
  out_of_scope: "Fora do escopo de TI",
  small_talk: "Conversa",
  unclear: "Pedido pouco claro",
  error: "Erro",
};

/** The service desk rules (Annex A) a reply can cite. */
export const ruleIdSchema = z.enum([
  "required_fields",
  "confirm_before_acting",
  "no_duplicates",
  "reopen_window",
  "handoff_requested",
  "handoff_critical",
  "handoff_overdue",
  "handoff_low_confidence",
  "privacy",
  "scope_it_only",
  "priority_matrix",
  "sla_deadline",
]);
export type RuleId = z.infer<typeof ruleIdSchema>;

export const RULE_LABEL: Record<RuleId, string> = {
  required_fields: "Todo chamado precisa de título, descrição, tipo, categoria, prioridade e afetados",
  confirm_before_acting: "Só cria ou atualiza depois da confirmação",
  no_duplicates: "Sem duplicidade: atualiza o chamado que já existe",
  reopen_window: "Chamados resolvidos há até 7 dias podem ser reabertos",
  handoff_requested: "Transferência: o funcionário pediu um analista",
  handoff_critical: "Transferência: caso crítico",
  handoff_overdue: "Transferência: chamado vencido",
  handoff_low_confidence: "Transferência: o agent não teve segurança",
  privacy: "Privacidade: só os chamados de quem os abriu",
  scope_it_only: "Escopo: apenas assuntos de TI",
  priority_matrix: "Prioridade combina impacto e urgência",
  sla_deadline: "O prazo de resposta depende da prioridade",
};

export const stepRecordSchema = z.object({
  id: z.string(),
  tool: z.string(),
  label: z.string(),
  status: z.enum(["ok", "error"]),
  durationMs: z.number(),
  input: z.record(z.string(), z.unknown()),
  summary: z.string(),
});
export type StepRecord = z.infer<typeof stepRecordSchema>;

export const decisionRecordSchema = z.object({
  version: z.literal(1),
  intent: intentSchema,
  /** What the employee wants, in one sentence. */
  understanding: z.string(),
  /** What the agent did in this turn, in one sentence. */
  action: z.string(),
  /** Why, citing the sources it used. */
  rationale: z.string(),
  confidence: z.object({
    score: z.number(),
    level: z.enum(["alta", "media", "baixa"]),
    factors: z.array(z.object({ label: z.string(), effect: z.enum(["raises", "lowers", "neutral"]) })),
  }),
  /** `verified` rules were confirmed by the system from what actually ran; the others are the model's claim. */
  rules: z.array(z.object({ id: ruleIdSchema, label: z.string(), verified: z.boolean() })),
  steps: z.array(stepRecordSchema),
  /** Protections that stepped in (blocked a duplicate, rewrote a reply, handed the case over). */
  guardrails: z.array(z.object({ id: z.string(), detail: z.string() })),
  handoff: z
    .object({
      reason: handoffReasonSchema,
      group: supportGroupSchema,
      respondBy: z.string().nullable(),
      ticketId: z.string().nullable(),
      auto: z.boolean(),
    })
    .nullable(),
  usage: z
    .object({
      model: z.string(),
      inputTokens: z.number(),
      outputTokens: z.number(),
      latencyMs: z.number(),
      modelSteps: z.number(),
    })
    .nullable(),
});
export type DecisionRecord = z.infer<typeof decisionRecordSchema>;
export type Guardrail = DecisionRecord["guardrails"][number];

/** What actually ran in the turn: the source of the rules the system can vouch for. */
export interface RuleFacts {
  priorityClassified: boolean;
  draftKinds: ReadonlyArray<"ticket_create" | "ticket_update" | "ticket_reopen">;
  duplicateBlocked: boolean;
  handoffReason: HandoffReason | null;
  ticketLookups: boolean;
}

const HANDOFF_RULE: Record<HandoffReason, RuleId> = {
  employee_request: "handoff_requested",
  critical: "handoff_critical",
  overdue: "handoff_overdue",
  low_confidence: "handoff_low_confidence",
};

export function deriveRules(facts: RuleFacts): RuleId[] {
  const rules = new Set<RuleId>();
  if (facts.priorityClassified) {
    rules.add("priority_matrix");
    rules.add("sla_deadline");
  }
  if (facts.draftKinds.includes("ticket_create")) {
    rules.add("required_fields");
    rules.add("confirm_before_acting");
  }
  if (facts.draftKinds.includes("ticket_update")) {
    rules.add("confirm_before_acting");
    rules.add("no_duplicates");
  }
  if (facts.draftKinds.includes("ticket_reopen")) {
    rules.add("confirm_before_acting");
    rules.add("reopen_window");
  }
  if (facts.duplicateBlocked) rules.add("no_duplicates");
  if (facts.handoffReason) rules.add(HANDOFF_RULE[facts.handoffReason]);
  if (facts.ticketLookups) rules.add("privacy");
  return [...rules];
}

export interface BuildDecisionInput {
  intent: Intent;
  understanding: string;
  action: string;
  rationale: string;
  modelConfidence: number;
  claimedRules: readonly RuleId[];
  ruleFacts: RuleFacts;
  evidence: ConfidenceEvidence;
  steps: StepRecord[];
  guardrails: Guardrail[];
  handoff: DecisionRecord["handoff"];
  usage: DecisionRecord["usage"];
}

/** Assembles the record shown to the employee and the analyst, separating what the system verified from what the model claimed. */
export function buildDecision(input: BuildDecisionInput): { decision: DecisionRecord; assessment: ConfidenceAssessment } {
  const assessment = assessConfidence(input.modelConfidence, input.evidence);
  const verified = deriveRules(input.ruleFacts);
  const claimedOnly = input.claimedRules.filter((id) => !verified.includes(id));
  const rules = [
    ...verified.map((id) => ({ id, label: RULE_LABEL[id], verified: true })),
    ...[...new Set(claimedOnly)].map((id) => ({ id, label: RULE_LABEL[id], verified: false })),
  ];

  return {
    assessment,
    decision: {
      version: 1,
      intent: input.intent,
      understanding: input.understanding,
      action: input.action,
      rationale: input.rationale,
      confidence: assessment,
      rules,
      steps: input.steps,
      guardrails: input.guardrails,
      handoff: input.handoff,
      usage: input.usage,
    },
  };
}
