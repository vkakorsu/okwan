import { describe, expect, it } from "vitest";
import { officerGraderAgreement } from "../judge-agreement";

const grade = (sessionId: string, probe_id: string, score: number) => ({ sessionId, scores: { probe_id, llm: { directness: score, specificity: score, consistency: score, conciseness: score } } });

describe("officer vs grader", () => {
  it("counts agreement, and which side is more generous, per topic", () => {
    const r = officerGraderAgreement(
      [
        { sessionId: "s1", probeId: "sponsor", quality: "strong" }, // grader 2/5: officer too generous
        { sessionId: "s2", probeId: "sponsor", quality: "strong" }, // grader 5/5: agree
        { sessionId: "s3", probeId: "school", quality: "weak" }, // grader 5/5: officer too harsh
        { sessionId: "s4", probeId: "school", quality: "adequate" }, // no grade: not counted
      ],
      [grade("s1", "sponsor", 2), grade("s2", "sponsor", 5), grade("s3", "school", 5)],
    );
    expect(r.overall).toEqual({ n: 3, agree: 1, officerHigher: 1, officerLower: 1 });
    expect(r.byTopic.find((t) => t.probeId === "sponsor")).toMatchObject({ n: 2, agree: 1, officerHigher: 1 });
  });

  it("uses the officer's final view of a topic, and a contradiction sticks", () => {
    const r = officerGraderAgreement(
      [
        { sessionId: "s1", probeId: "sponsor", quality: "weak" },
        { sessionId: "s1", probeId: "sponsor", quality: "strong" },
        { sessionId: "s2", probeId: "sponsor", quality: "contradiction" },
        { sessionId: "s2", probeId: "sponsor", quality: "strong" },
      ],
      [grade("s1", "sponsor", 5), grade("s2", "sponsor", 1)],
    );
    expect(r.overall.agree).toBe(2);
  });
});
