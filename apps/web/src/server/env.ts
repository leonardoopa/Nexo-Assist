import "server-only";

import { z } from "zod";

const envSchema = z.object({
  SESSION_SECRET: z.string().min(32, "precisa ter ao menos 32 caracteres"),
  SERVICEDESK_URL: z.url().default("http://localhost:8100"),
  SERVICEDESK_API_KEY: z.string().min(1, "é obrigatória"),
  DATABASE_PATH: z.string().min(1).default("./data/nexo-assist.db"),
  CHAT_MESSAGE_LIMIT: z.coerce.number().int().positive().default(30),
});

export type Env = z.infer<typeof envSchema>;

/** Validates the environment once and fails with a readable list of what is wrong. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `- ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Configuração inválida (veja .env.example):\n${problems}`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Lazy on purpose: nothing reads the environment while Next.js builds the app. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
