import { describe, expect, it } from "vitest";
import { CaseProfile } from "../case";
import { planSession } from "../director";
import { amaF1, kofiB1B2 } from "../fixtures";
import { buildOfficerInstruction, DECISION_LINES } from "../officer-prompt";
import { officerStyle, REAL_OFFICER_STYLE } from "../officer-style";
import { probesFor } from "../probes";
import { QUICK_CHECK_COVERED_BY, quickChecks } from "../quick-checks";

/** Behaviour taken from real West African F-1 transcripts (docs/INTERVIEW-REALISM.md §10). */
const base = { readiness: 0.3, mode: "real" as const, pastSessions: [] };
const plans = (n: number, extra: Partial<Parameters<typeof planSession>[0]> = {}) =>
  Array.from({ length: n }, (_, i) => planSession({ ...base, profile: amaF1, seed: `t${i}`, ...extra }));

describe("quick factual checks", () => {
  it("are only about facts on the file, and never repeat a planned topic", () => {
    for (const plan of plans(60)) {
      const planned = new Set(plan.probes.map((p) => p.probeId));
      for (const q of plan.quickChecks ?? []) {
        const check = quickChecks(amaF1).find((c) => c.question === q.question)!;
        expect(check).toBeDefined();
        expect(QUICK_CHECK_COVERED_BY[check.topic].some((id) => planned.has(id))).toBe(false);
      }
    }
    // Siblings and graduation year aren't on Ama's file, so they're never checked.
    expect(quickChecks(amaF1).map((c) => c.topic)).not.toContain("siblings");
    expect(quickChecks(amaF1).map((c) => c.topic)).not.toContain("graduation");
  });

  it("happen in most real interviews and reach the officer with the fact to check", () => {
    const withChecks = plans(40).filter((p) => p.quickChecks?.length);
    expect(withChecks.length).toBeGreaterThan(30);
    const text = buildOfficerInstruction(withChecks[0], amaF1);
    expect(text).toContain("QUICK CHECKS");
    expect(text).toContain(`(file: ${withChecks[0].quickChecks![0].onFile})`);
  });
});

describe("looking at documents", () => {
  it("asks to see a matching folder document in about half of real interviews, and never without one", () => {
    expect(plans(40).some((p) => p.probes.some((x) => x.askToSee))).toBe(false);
    const folder = ["bank_statement", "sponsor_letter", "employment_letter"];
    const asked = plans(80, { folder }).filter((p) => p.probes.some((x) => x.askToSee));
    expect(asked.length).toBeGreaterThan(20);
    expect(asked.length).toBeLessThan(65);
    for (const p of asked) {
      const probe = p.probes.find((x) => x.askToSee)!;
      expect(folder).toContain(probe.askToSee);
      expect(buildOfficerInstruction(p, amaF1)).toContain("call request_document");
    }
  });
});

describe("how the officer talks", () => {
  it("is told to be terse, react to the file and call out recited answers", () => {
    const text = buildOfficerInstruction(plans(1)[0], amaF1);
    expect(text).toContain("Most of your lines are under ten words");
    expect(text).toMatch(/memorised or recited/);
  });

  it("ends the way Accra officers do", () => {
    expect(DECISION_LINES.approved).toContain("I'm approving your visa");
    expect(DECISION_LINES.approved).toContain("DHL");
  });

  it("measures style the way the real transcripts were measured", () => {
    const s = officerStyle(["Good morning, pass me your documents.", "Graduated when?", "I see you have a scholarship.", "Who is sponsoring you?"])!;
    expect(s.lines).toBe(4);
    expect(s.medianWords).toBeLessThanOrEqual(REAL_OFFICER_STYLE.p90Words);
    expect(s.nonQuestionShare).toBe(0.5);
    expect(officerStyle([])).toBeNull();
  });
});

describe("topics seen in real interviews", () => {
  it("asks how they found the school and to explain their own field", () => {
    const ids = probesFor("F1").map((p) => p.id);
    expect(ids).toContain("f1.purpose.discovery");
    expect(ids).toContain("f1.academic.explain");
  });

  it("asks a non-Ghanaian applying in Accra to show they live in Ghana", () => {
    const residence = probesFor("B1B2").find((p) => p.id === "common.residence")!;
    expect(residence.relevance(kofiB1B2)).toBe(0);
    expect(residence.relevance(CaseProfile.parse({ ...kofiB1B2, applicant: { ...kofiB1B2.applicant, nationality: "Ghanaian" } }))).toBe(0);
    const nigerian = CaseProfile.parse({ ...kofiB1B2, applicant: { ...kofiB1B2.applicant, nationality: "Nigerian" } });
    expect(residence.relevance(nigerian)).toBe(1);
    const all = Array.from({ length: 20 }, (_, i) => planSession({ ...base, profile: nigerian, seed: `n${i}` }));
    expect(all.filter((p) => p.probes.some((x) => x.probeId === "common.residence")).length).toBeGreaterThan(10);
  });
});

describe("fixes from a real session", () => {
  it("tells the officer a fragment isn't an answer, and doesn't ask the model for answer length", async () => {
    const { officerTools } = await import("../officer-prompt");
    const text = buildOfficerInstruction(plans(1)[0], amaF1);
    expect(text).toContain('Say "Go on."');
    const logProbe = officerTools.find((t) => t.name === "log_probe")!;
    expect(Object.keys(logProbe.parametersJsonSchema.properties)).not.toContain("answer_seconds");
  });
});
