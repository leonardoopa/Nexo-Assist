import { stripAccents } from "./text";

export type ConfirmationAnswer = "confirm" | "cancel" | "other";

// A reply counts only when every word is part of a plain yes or no. Anything extra
// ("sim, mas muda o título") goes to the model, because the employee is editing the draft.
const FILLER = new Set(["por", "favor", "obrigado", "obrigada", "valeu", "ai", "entao", "la", "pra", "para", "o", "a"]);
const YES_WORDS = new Set(["sim", "s", "ok", "okay", "certo", "isso", "mesmo", "confirmo", "confirmar", "pode", "ser", "abrir", "criar", "atualizar", "registrar", "reabrir", "seguir", "manda", "ver", "vai", "beleza", "perfeito", "combinado", "tudo", "esta", "ta", "correto", "exato"]);
const YES_STRONG = new Set(["sim", "s", "ok", "okay", "certo", "confirmo", "confirmar", "pode", "beleza", "perfeito", "combinado", "correto", "exato", "manda", "isso"]);
const NO_WORDS = new Set(["nao", "n", "cancela", "cancelar", "cancele", "isso", "deixa", "esquece", "precisa", "quero", "mais", "desisto", "melhor"]);
const NO_STRONG = new Set(["nao", "n", "cancela", "cancelar", "cancele", "esquece", "desisto", "deixa"]);

/** Reads a typed reply to a pending draft: an unmistakable yes, an unmistakable no, or something else. */
export function classifyConfirmation(text: string): ConfirmationAnswer {
  const words = stripAccents(text.toLowerCase())
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !FILLER.has(word));
  if (words.length === 0 || words.length > 6) return "other";

  const allYes = words.every((word) => YES_WORDS.has(word));
  const allNo = words.every((word) => NO_WORDS.has(word));
  if (allYes && words.some((word) => YES_STRONG.has(word))) return "confirm";
  if (allNo && words.some((word) => NO_STRONG.has(word))) return "cancel";
  return "other";
}
