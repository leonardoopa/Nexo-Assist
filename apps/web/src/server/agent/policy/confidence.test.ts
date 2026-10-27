import { describe, expect, it } from "vitest";

import { LOW_CONFIDENCE, assessConfidence, type ConfidenceEvidence } from "./confidence";

const none: ConfidenceEvidence = { knowledgeTopScore: null, toolErrors: 0, explicitConfirmation: false, guardrailTriggered: false };

describe("assessConfidence", () => {
  it("keeps the model's score when nothing contradicts it", () => {
    expect(assessConfidence(0.82, none)).toMatchObject({ score: 0.82, level: "alta" });
    expect(assessConfidence(0.6, none)).toMatchObject({ score: 0.6, level: "media" });
    expect(assessConfidence(0.41, none)).toMatchObject({ score: 0.41, level: "baixa" });
  });

  it("caps a confident answer that rests on a weak article", () => {
    const result = assessConfidence(0.9, { ...none, knowledgeTopScore: 0.2 });
    expect(result.score).toBe(0.55);
    expect(result.factors.some((factor) => factor.effect === "lowers" && /pouco relacionado/.test(factor.label))).toBe(true);
  });

  it("explains a strong article without inflating the score", () => {
    const result = assessConfidence(0.8, { ...none, knowledgeTopScore: 0.93 });
    expect(result.score).toBe(0.8);
    expect(result.factors.some((factor) => factor.effect === "raises")).toBe(true);
  });

  it("caps the score when the ticket system failed", () => {
    expect(assessConfidence(0.95, { ...none, toolErrors: 1 }).score).toBe(0.6);
  });

  it("caps the score hard when a guardrail had to correct the reply", () => {
    expect(assessConfidence(0.95, { ...none, guardrailTriggered: true })).toMatchObject({ score: 0.3, level: "baixa" });
  });

  it("raises to near certainty on an explicit confirmation", () => {
    expect(assessConfidence(0.5, { ...none, explicitConfirmation: true }).score).toBe(0.95);
  });

  it("clamps nonsense input and exposes the threshold", () => {
    expect(assessConfidence(7, none).score).toBe(1);
    expect(assessConfidence(-1, none).score).toBe(0);
    expect(LOW_CONFIDENCE).toBe(0.5);
  });
});
