import type { ReplyInput } from "@/server/agent/reply-schema";

type Part = Record<string, unknown>;

export interface ScriptedToolCall {
  name: string;
  args: Record<string, unknown>;
}

/** One model call, in order: some tool calls, a plain text answer, or a failure. */
export type ScriptedStep = ScriptedToolCall[] | { text: string } | { error: Error };

const usage = { inputTokens: 100, outputTokens: 20, totalTokens: 120 };

function chunksOf(text: string, size: number): string[] {
  const out: string[] = [];
  for (let index = 0; index < text.length; index += size) out.push(text.slice(index, index + size));
  return out;
}

function partsFor(step: ScriptedToolCall[] | { text: string }, stepNumber: number): Part[] {
  if ("text" in step) {
    const id = `text-${stepNumber}`;
    return [
      { type: "text-start", id },
      ...chunksOf(step.text, 6).map((delta) => ({ type: "text-delta", id, delta })),
      { type: "text-end", id },
      { type: "finish", finishReason: "stop", usage },
    ];
  }
  const parts: Part[] = [];
  step.forEach((call, index) => {
    const id = `call-${stepNumber}-${index}`;
    const json = JSON.stringify(call.args);
    parts.push({ type: "tool-input-start", id, toolName: call.name });
    for (const delta of chunksOf(json, 9)) parts.push({ type: "tool-input-delta", id, delta });
    parts.push({ type: "tool-input-end", id });
    parts.push({ type: "tool-call", toolCallId: id, toolName: call.name, input: json });
  });
  parts.push({ type: "finish", finishReason: "tool-calls", usage });
  return parts;
}

/**
 * A stand-in language model that plays back a script, so the whole agent (Mastra's loop, the tools,
 * the policy, the stream) runs for real in tests without a provider. It records every request.
 */
export function scriptedModel(steps: ScriptedStep[]) {
  let call = 0;
  const requests: Array<{ prompt: unknown; toolChoice: unknown }> = [];
  return {
    requests,
    get callCount() {
      return call;
    },
    specificationVersion: "v2" as const,
    provider: "scripted",
    modelId: "scripted-1",
    supportedUrls: {},
    async doGenerate(): Promise<never> {
      throw new Error("doGenerate não é usado: o agent sempre faz streaming.");
    },
    async doStream(options: { prompt: unknown; toolChoice: unknown }) {
      requests.push({ prompt: options.prompt, toolChoice: options.toolChoice });
      const step = steps[call];
      call += 1;
      if (!step) throw new Error("O roteiro acabou: o agent pediu mais chamadas ao modelo do que o previsto.");
      if ("error" in step) throw step.error;
      const parts = partsFor(step, call);
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] });
            for (const part of parts) controller.enqueue(part);
            controller.close();
          },
        }),
      };
    },
  };
}

export const call = (name: string, args: Record<string, unknown> = {}): ScriptedToolCall => ({ name, args });

type ReplyOverrides = Partial<ReplyInput["decision"]> & { ui?: ReplyInput["ui"] };

/** The `reply_to_employee` call every turn ends with. */
export function replyCall(message: string, overrides: ReplyOverrides = {}): ScriptedToolCall {
  const { ui, ...decision } = overrides;
  return call("reply_to_employee", {
    message,
    decision: {
      intent: "answer_question",
      understanding: "O funcionário quer ajuda com um problema de TI.",
      action: "Respondeu com base nas consultas.",
      confidence: 0.9,
      rationale: "Baseado nas consultas feitas neste turno.",
      rules: [],
      ...decision,
    },
    ...(ui ? { ui } : {}),
  });
}
