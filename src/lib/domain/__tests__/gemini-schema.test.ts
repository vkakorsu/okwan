import { describe, expect, it } from "vitest";
import { GeneratedCaseQuestions } from "../case-questions";
import { ExtractedFacts } from "../draft";
import { Debrief, GEMINI_SCHEMA_KEYWORDS, geminiJsonSchema, schemaKeywords } from "../gemini-schema";

/**
 * Gemini rejects a whole request on a schema keyword it doesn't support. That's
 * how every document read failed on 26 Sep 2026 (`exclusiveMinimum`, from a
 * `.positive()` field). Every schema we send must stay inside the subset.
 */
describe("schemas sent to Gemini", () => {
  for (const [name, schema] of [
    ["document extraction", ExtractedFacts],
    ["debrief grading", Debrief],
    ["case questions", GeneratedCaseQuestions],
  ] as const) {
    it(`${name} uses only keywords Gemini accepts`, () => {
      const unsupported = [...schemaKeywords(geminiJsonSchema(schema))].filter((k) => !GEMINI_SCHEMA_KEYWORDS.has(k));
      // Field names inside "properties" are skipped by schemaKeywords, so anything left is a real keyword.
      expect(unsupported).toEqual([]);
    });
  }

  it("turns 'more than 0' into an inclusive minimum", () => {
    const text = JSON.stringify(geminiJsonSchema(ExtractedFacts));
    expect(text).not.toContain("exclusiveMinimum");
    expect(text).not.toContain("pattern");
  });
});
