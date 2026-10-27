import { describe, expect, it } from "vitest";

import { classifyLlmError, llmConfigProblem } from "./model";

describe("llmConfigProblem", () => {
  it("passes when the provider key is set", () => {
    expect(llmConfigProblem("anthropic/claude-haiku-5-5", { ANTHROPIC_API_KEY: "sk-test" })).toBeNull();
    expect(llmConfigProblem("google/gemini-2.5-flash", { GOOGLE_GENERATIVE_AI_API_KEY: "k" })).toBeNull();
  });

  it("names the variable to set when the key is missing or blank", () => {
    expect(llmConfigProblem("openai/gpt-5-mini", {})).toMatch(/OPENAI_API_KEY/);
    expect(llmConfigProblem("anthropic/claude-haiku-5-5", { ANTHROPIC_API_KEY: "  " })).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("leaves providers it does not know to Mastra", () => {
    expect(llmConfigProblem("mistral/mistral-small", {})).toBeNull();
  });
});

describe("classifyLlmError", () => {
  it.each([
    [new Error("Request timed out after 45000ms"), "llm_timeout", true],
    [Object.assign(new Error("Too many requests"), { statusCode: 429 }), "llm_rate_limited", true],
    [new Error("Overloaded"), "llm_rate_limited", true],
    [Object.assign(new Error("invalid x-api-key"), { statusCode: 401 }), "llm_not_configured", false],
    [new Error("socket hang up"), "llm_unavailable", true],
  ])("maps %s to %s", (error, code, retryable) => {
    expect(classifyLlmError(error)).toMatchObject({ code, retryable });
  });
});
