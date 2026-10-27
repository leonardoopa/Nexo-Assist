export type ConfidenceLevel = "alta" | "media" | "baixa";

export interface ConfidenceFactor {
  label: string;
  effect: "raises" | "lowers" | "neutral";
}

export interface ConfidenceAssessment {
  score: number;
  level: ConfidenceLevel;
  factors: ConfidenceFactor[];
}

export interface ConfidenceEvidence {
  /** Relevance (0 to 1) of the best help center article, when the answer rests on the help center. */
  knowledgeTopScore: number | null;
  /** Tool calls that failed this turn. */
  toolErrors: number;
  /** The employee's confirmation was explicit (button or an unmistakable "sim"). */
  explicitConfirmation: boolean;
  /** A reply was blocked or rewritten by a guardrail. */
  guardrailTriggered: boolean;
}

/** Below this the agent should not act on its own: it asks, or hands the case to a person. */
export const LOW_CONFIDENCE = 0.5;

const level = (score: number): ConfidenceLevel => (score >= 0.75 ? "alta" : score >= LOW_CONFIDENCE ? "media" : "baixa");
const percent = (value: number) => `${Math.round(value * 100)}%`;

/**
 * The model's own score is only a starting point: it is capped by what the evidence supports,
 * so a confident-sounding answer built on a weak article or a failing system is never shown as
 * a confident one. Every adjustment is listed as a factor so the number can be explained.
 */
export function assessConfidence(modelScore: number, evidence: ConfidenceEvidence): ConfidenceAssessment {
  const factors: ConfidenceFactor[] = [{ label: `O agent estimou ${percent(modelScore)}`, effect: "neutral" }];
  let score = Math.min(1, Math.max(0, modelScore));

  if (evidence.explicitConfirmation) {
    factors.push({ label: "Confirmação explícita do funcionário", effect: "raises" });
    score = Math.max(score, 0.95);
  }
  if (evidence.knowledgeTopScore !== null) {
    if (evidence.knowledgeTopScore >= 0.7) {
      factors.push({ label: `Artigo da central de ajuda muito relacionado (${percent(evidence.knowledgeTopScore)})`, effect: "raises" });
    } else if (evidence.knowledgeTopScore < 0.35) {
      factors.push({ label: `Artigo da central de ajuda pouco relacionado (${percent(evidence.knowledgeTopScore)})`, effect: "lowers" });
      score = Math.min(score, 0.55);
    }
  }
  if (evidence.toolErrors > 0) {
    factors.push({ label: "O sistema de chamados falhou durante a consulta", effect: "lowers" });
    score = Math.min(score, 0.6);
  }
  if (evidence.guardrailTriggered) {
    factors.push({ label: "Uma proteção do sistema corrigiu a resposta", effect: "lowers" });
    score = Math.min(score, 0.3);
  }

  const rounded = Math.round(score * 100) / 100;
  return { score: rounded, level: level(rounded), factors };
}
