import { describe, expect, it } from "vitest";

import { createStringFieldExtractor } from "./stream-field";

/** Feeds `json` in chunks of `size` characters and returns what the extractor produced. */
function run(json: string, size: number, field = "message"): string {
  const extractor = createStringFieldExtractor(field);
  let text = "";
  for (let index = 0; index < json.length; index += size) text += extractor.push(json.slice(index, index + size));
  return text;
}

const payload = JSON.stringify({
  message: 'Olá, "Ana"!\nTudo bem? Preço: R$ 5 \\ 6 — açaí 😀',
  decision: { intent: "small_talk", rationale: 'contém "message": "outra"' },
});

describe("createStringFieldExtractor", () => {
  it.each([1, 2, 3, 5, 7, 64, 10_000])("rebuilds the text no matter how the JSON is cut (%i chars at a time)", (size) => {
    expect(run(payload, size)).toBe('Olá, "Ana"!\nTudo bem? Preço: R$ 5 \\ 6 — açaí 😀');
  });

  it("returns only the new text on each push", () => {
    const extractor = createStringFieldExtractor("message");
    expect(extractor.push('{"mess')).toBe("");
    expect(extractor.push('age":"Olá')).toBe("Olá");
    expect(extractor.push(", Ana")).toBe(", Ana");
    expect(extractor.push('","decision":{}}')).toBe("");
    expect(extractor.done).toBe(true);
    expect(extractor.push("more")).toBe("");
  });

  it("waits for a split escape sequence", () => {
    const extractor = createStringFieldExtractor("message");
    expect(extractor.push('{"message":"a\\')).toBe("a");
    expect(extractor.push("nb")).toBe("\nb");
    expect(extractor.push('\\u00')).toBe("");
    expect(extractor.push('e9"}')).toBe("é");
  });

  it("finds the field when it is not the first key, and ignores a missing one", () => {
    expect(run('{"decision":{"intent":"x"},"message":"depois"}', 4)).toBe("depois");
    expect(run('{"other":"valor"}', 3)).toBe("");
  });
});
