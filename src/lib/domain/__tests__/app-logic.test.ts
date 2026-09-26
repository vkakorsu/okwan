import { describe, expect, it } from "vitest";
import { deliveryMetrics } from "../delivery";
import { mergeDraft } from "../draft";
import { planSession } from "../director";
import { entitlement } from "../entitlement";
import { amaF1, kofiB1B2 } from "../fixtures";
import { buildOfficerInstruction, officerFile } from "../officer-prompt";
import { validateRewrite } from "../rewrite-validator";

describe("validateRewrite", () => {
  it("accepts a rewrite built only from confirmed facts", () => {
    const r = validateRewrite(
      "My father pays. He's a cocoa exporter earning about $60,000 a year, and $41,000 is already in the account.",
      amaF1,
    );
    expect(r).toEqual({ ok: true, unsupported: [] });
  });

  it("blocks invented numbers and people", () => {
    const r = validateRewrite("My uncle Kwame in Toronto will add $25,000.", amaF1);
    expect(r.ok).toBe(false);
    expect(r.unsupported).toEqual(expect.arrayContaining(["Kwame", "Toronto", "25000"]));
  });

  it("allows facts the user said themselves", () => {
    expect(validateRewrite("I work at Hubtel and my manager is Esi.", amaF1, "my manager Esi").ok).toBe(true);
  });

  it("accepts 41k style amounts", () => {
    expect(validateRewrite("About 41k is in the account.", amaF1).ok).toBe(true);
  });
});

describe("deliveryMetrics", () => {
  it("counts fillers and flags long answers", () => {
    const m = deliveryMetrics("Um, so, like, my father, uh, he pays, you know", 41);
    expect(m.fillers).toBe(4);
    expect(m.tooLong).toBe(true);
    expect(m.wordsPerMinute).toBeGreaterThan(0);
  });
});

describe("officer instruction", () => {
  const plan = planSession({ profile: kofiB1B2, pastSessions: [], readiness: 0.3, mode: "real", seed: "prompt" });
  const text = buildOfficerInstruction(plan, kofiB1B2);

  it("includes the plan's questions and the officer's name", () => {
    expect(text).toContain(plan.officer.name);
    for (const p of plan.probes) expect(text).toContain(p.entry);
  });

  it("shows the officer only what a real officer sees", () => {
    const file = officerFile(amaF1);
    expect(Object.keys(file)).not.toContain("version");
    expect(JSON.stringify(file)).not.toContain("Return to lead analytics");
    expect(text).not.toMatch(/readiness|weak_retest|pastSessions/i);
  });
});

describe("entitlement", () => {
  const none = { interviews: 0, drills: 0, expiresAt: null };
  it("gives one free mock per account, then asks for credits", () => {
    expect(entitlement({ credits: none, freeSessionsUsed: 0 }).kind).toBe("free");
    expect(entitlement({ credits: none, freeSessionsUsed: 1 }).kind).toBe("none");
  });
  it("uses paid interviews before the free mock", () => {
    const e = entitlement({ credits: { interviews: 2, drills: 0, expiresAt: new Date() }, freeSessionsUsed: 0 });
    expect(e).toEqual({ kind: "full", reason: "2 interviews left" });
  });
});

describe("mergeDraft", () => {
  it("fills gaps and flags disagreements instead of overwriting", () => {
    const a = { study: { school: "UC", program: "MS Data Science" }, funding: { liquidFundsUsd: 41000 } };
    const b = { study: { school: "UC", startTerm: "Fall 2027" }, funding: { liquidFundsUsd: 39000 } };
    const { merged, conflicts } = mergeDraft(a, b, "bank_statement");
    expect(merged).toEqual({
      study: { school: "UC", program: "MS Data Science", startTerm: "Fall 2027" },
      funding: { liquidFundsUsd: 41000 },
    });
    expect(conflicts).toEqual([{ path: "funding.liquidFundsUsd", existing: 41000, incoming: 39000, source: "bank_statement" }]);
  });
});

import { liveBehaviour } from "../live-behaviour";

describe("liveBehaviour", () => {
  const base = planSession({ profile: amaF1, pastSessions: [], readiness: 0.3, mode: "real", seed: "live" });
  const withTraits = (patience: number, events: typeof base.events = []) => ({
    ...base,
    events,
    officer: { ...base.officer, traits: { ...base.officer.traits, patience } },
  });

  it("gives impatient officers a shorter end-of-turn silence, never under 0.7 s", () => {
    expect(liveBehaviour(withTraits(0)).endOfTurnSilenceMs).toBe(700);
    expect(liveBehaviour(withTraits(1)).endOfTurnSilenceMs).toBe(1300);
  });

  it("only cuts in when the officer is impatient or the plan says so", () => {
    expect(liveBehaviour(withTraits(0.9)).cutInAfterSec).toBeNull();
    expect(liveBehaviour(withTraits(0.1)).cutInAfterSec).toBe(17);
    expect(liveBehaviour(withTraits(0.9, ["interrupt_mid_answer"])).cutInAfterSec).toBe(33);
  });

  it("places a typing silence on turn 2 or 3 when planned", () => {
    const b = liveBehaviour(withTraits(0.5, ["typing_silence"]));
    expect([2, 3]).toContain(b.typingSilence?.turn);
    expect(b.typingSilence!.seconds).toBeGreaterThanOrEqual(3);
  });

  it("bounds the token lifetime to the planned length plus a margin", () => {
    expect(liveBehaviour({ ...base, targetDurationSec: 60 }).tokenLifetimeSec).toBe(300);
    expect(liveBehaviour({ ...base, targetDurationSec: 240 }).tokenLifetimeSec).toBe(420);
  });
});

import { mergeGrades } from "../grade-merge";

describe("mergeGrades", () => {
  const t = (seq: number, d: number, flags: string[]) => ({
    seq,
    scores: { directness: d, specificity: 3, consistency: 4, conciseness: 2 },
    red_flags: flags,
  });

  it("averages scores, keeps only flags both runs raised, and reports agreement", () => {
    const { merged, agreement } = mergeGrades(
      { turns: [t(1, 5, ["Rambling", "Vague sponsor"])] },
      { turns: [t(1, 3, ["vague sponsor"])] },
    );
    expect(merged.turns[0].scores.directness).toBe(4);
    expect(merged.turns[0].red_flags).toEqual(["Vague sponsor"]);
    expect(agreement).toBe(0.88);
  });

  it("falls back to a single run", () => {
    const run = { turns: [t(1, 5, ["x"])] };
    expect(mergeGrades(run, null)).toEqual({ merged: run, agreement: null });
  });
});

import { sameApplicant } from "../identity";

describe("sameApplicant", () => {
  const next = (patch: (p: typeof amaF1) => void) => {
    const p = structuredClone(amaF1);
    patch(p);
    return p;
  };

  it("allows ordinary corrections to the same person", () => {
    expect(sameApplicant(amaF1, next((p) => (p.applicant.age += 1))).ok).toBe(true);
    expect(sameApplicant(amaF1, next((p) => (p.study!.school = "Ohio State University"))).ok).toBe(true);
    expect(sameApplicant(amaF1, next((p) => (p.funding.liquidFundsUsd = 60000))).ok).toBe(true);
  });

  it("blocks swapping in a different applicant", () => {
    expect(sameApplicant(amaF1, next((p) => (p.applicant.firstName = "Kwame")))).toEqual({ ok: false, field: "first name" });
    expect(sameApplicant(amaF1, next((p) => (p.applicant.age = 31)))).toEqual({ ok: false, field: "age" });
    expect(
      sameApplicant(
        amaF1,
        next((p) => {
          p.study!.school = "Boston University";
          p.study!.program = "MBA";
        }),
      ),
    ).toEqual({ ok: false, field: "school and program" });
  });
});
