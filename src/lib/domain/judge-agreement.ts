import type { AnswerQuality } from "./director";

/**
 * The live officer judges each answer as it happens; the debrief grader scores
 * the same answer afterwards, twice, against anchored rubrics. Comparing the
 * two per topic shows where live judging drifts (docs/INTERVIEW-REALISM.md §3).
 */

const OFFICER: Record<AnswerQuality, number> = { strong: 1, adequate: 0.6, weak: 0.15, contradiction: 0 };
/** A gap bigger than this (on a 0..1 scale) counts as a disagreement: e.g. "strong" against a 2.5/5 grade. */
export const DISAGREE_AT = 0.4;

export interface AgreementRow {
  probeId: string;
  n: number;
  agree: number;
  officerHigher: number;
  officerLower: number;
}

export function officerGraderAgreement(
  officer: readonly { sessionId: string; probeId: string; quality: AnswerQuality }[],
  graded: readonly { sessionId: string; scores: unknown }[],
): { overall: Omit<AgreementRow, "probeId">; byTopic: AgreementRow[] } {
  // The officer's final view of a topic in a session: the last judgement, a contradiction sticks.
  const final = new Map<string, AnswerQuality>();
  for (const o of officer) {
    const key = `${o.sessionId}|${o.probeId}`;
    if (final.get(key) === "contradiction") continue;
    final.set(key, o.quality);
  }
  // The grader's mean per topic per session, 0..1.
  const grades = new Map<string, number[]>();
  for (const g of graded) {
    const s = g.scores as { probe_id?: string | null; llm?: Record<string, number> } | null;
    const values = Object.values(s?.llm ?? {}).filter((v) => typeof v === "number");
    if (!s?.probe_id || !values.length) continue;
    const key = `${g.sessionId}|${s.probe_id}`;
    grades.set(key, [...(grades.get(key) ?? []), (values.reduce((a, b) => a + b, 0) / values.length - 1) / 4]);
  }
  const rows = new Map<string, AgreementRow>();
  const overall = { n: 0, agree: 0, officerHigher: 0, officerLower: 0 };
  for (const [key, quality] of final) {
    const g = grades.get(key);
    if (!g) continue;
    const probeId = key.split("|")[1];
    const gap = OFFICER[quality] - g.reduce((a, b) => a + b, 0) / g.length;
    const row = rows.get(probeId) ?? { probeId, n: 0, agree: 0, officerHigher: 0, officerLower: 0 };
    for (const r of [row, overall]) {
      r.n++;
      if (gap > DISAGREE_AT) r.officerHigher++;
      else if (gap < -DISAGREE_AT) r.officerLower++;
      else r.agree++;
    }
    rows.set(probeId, row);
  }
  return { overall, byTopic: [...rows.values()].sort((a, b) => a.agree / a.n - b.agree / b.n) };
}
