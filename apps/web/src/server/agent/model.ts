import type { TurnErrorCode } from "@/server/chat/events";

/** Environment variables Mastra reads for each provider, to fail early with a clear message. */
const PROVIDER_KEYS: Record<string, string[]> = {
  anthropic: ["ANTHROPIC_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  google: ["GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
};

/** `null` when the model can be called; otherwise what to fix. Unknown providers are left to Mastra. */
export function llmConfigProblem(modelName: string, env: Record<string, string | undefined>): string | null {
  const provider = modelName.split("/")[0] ?? "";
  const keys = PROVIDER_KEYS[provider];
  if (!keys || keys.some((key) => Boolean(env[key]?.trim()))) return null;
  return `O assistente ainda não está configurado: defina ${keys.join(" ou ")} no .env (modelo ${modelName}).`;
}

export interface ClassifiedLlmError {
  code: TurnErrorCode;
  message: string;
  retryable: boolean;
}

/** Turns whatever the model call threw into something the employee can act on. */
export function classifyLlmError(error: unknown): ClassifiedLlmError {
  const text = `${error instanceof Error ? `${error.name} ${error.message}` : String(error)}`.toLowerCase();
  const status = typeof error === "object" && error !== null && "statusCode" in error ? Number((error as { statusCode: unknown }).statusCode) : 0;

  if (/timeout|timed out|aborted/.test(text)) {
    return { code: "llm_timeout", message: "O assistente demorou demais para responder. Tente de novo.", retryable: true };
  }
  if (status === 429 || /rate.?limit|overloaded|too many requests|429/.test(text)) {
    return { code: "llm_rate_limited", message: "O assistente está com muita procura agora. Tente de novo em instantes.", retryable: true };
  }
  if (status === 401 || status === 403 || /api key|unauthorized|authentication|invalid x-api-key|permission/.test(text)) {
    return { code: "llm_not_configured", message: "A chave do modelo foi recusada. Confira a configuração do assistente.", retryable: false };
  }
  return { code: "llm_unavailable", message: "O assistente não conseguiu responder agora. Tente de novo.", retryable: true };
}
