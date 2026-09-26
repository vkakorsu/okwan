import { z } from "zod";
import { Claim } from "./story";

/**
 * JSON schemas for Gemini structured output. Gemini accepts only a subset of
 * JSON Schema and rejects the whole request ("400 INVALID_ARGUMENT") on
 * anything else. zod emits a few of those (`.positive()` becomes
 * `exclusiveMinimum`, `.regex()` becomes `pattern`), so every schema is
 * cleaned here before it's sent. Replies are still validated with the full
 * zod schema afterwards.
 */

/** Keywords Gemini's responseJsonSchema accepts (plus property names inside `properties`). */
export const GEMINI_SCHEMA_KEYWORDS = new Set([
  "type", "properties", "required", "items", "prefixItems", "enum", "const", "format", "title", "description",
  "minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength", "additionalProperties",
  "anyOf", "oneOf", "$ref", "$defs", "$id", "$anchor", "nullable", "propertyOrdering", "default",
]);

type Json = unknown;

function clean(node: Json): Json {
  if (Array.isArray(node)) return node.map(clean);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, Json> = {};
  const src = node as Record<string, Json>;
  for (const [k, v] of Object.entries(src)) {
    if (k === "properties" || k === "$defs") {
      // Keys here are field names, not keywords.
      out[k] = Object.fromEntries(Object.entries(v as Record<string, Json>).map(([name, s]) => [name, clean(s)]));
    } else if (k === "exclusiveMinimum" && typeof v === "number") {
      // An integer above x is at least x + 1; for other numbers, "at least" is close enough.
      out.minimum = src.type === "integer" ? v + 1 : v;
    } else if (k === "exclusiveMaximum" && typeof v === "number") {
      out.maximum = src.type === "integer" ? v - 1 : v;
    } else if (GEMINI_SCHEMA_KEYWORDS.has(k)) {
      out[k] = clean(v);
    }
    // Anything else (pattern, $schema, not, if/then…) is dropped.
  }
  return out;
}

export function geminiJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return clean(z.toJSONSchema(schema)) as Record<string, unknown>;
}

/** Every keyword used in a schema (property names excluded), for tests. */
export function schemaKeywords(node: Json, acc = new Set<string>()): Set<string> {
  if (Array.isArray(node)) node.forEach((n) => schemaKeywords(n, acc));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, Json>)) {
      acc.add(k);
      if (k === "properties" || k === "$defs") Object.values(v as Record<string, Json>).forEach((s) => schemaKeywords(s, acc));
      else schemaKeywords(v, acc);
    }
  }
  return acc;
}

/* The grader's reply (src/lib/server/gemini.ts gradeDebrief). */

export const GradedTurn = z.object({
  seq: z.number().int(),
  probe_id: z.string().nullable(),
  testing: z.enum(["purpose", "intent", "ties", "funding", "sponsor", "academic", "career", "history", "credibility", "other"]),
  scores: z.object({
    directness: z.number().int().min(1).max(5),
    specificity: z.number().int().min(1).max(5),
    consistency: z.number().int().min(1).max(5),
    conciseness: z.number().int().min(1).max(5),
  }),
  red_flags: z.array(z.string().max(120)).max(5),
  stronger_answer: z.string().max(400).nullable(),
  missing_evidence: z.string().max(300).nullable(),
});

export const Debrief = z.object({
  summary: z.string().max(600),
  top_fixes: z.array(z.string().max(200)).min(1).max(3),
  turns: z.array(GradedTurn),
  /** Facts the applicant stated, for the story tracker (src/lib/domain/story.ts). */
  claims: z.array(Claim).max(30).default([]),
});
export type Debrief = z.infer<typeof Debrief>;
