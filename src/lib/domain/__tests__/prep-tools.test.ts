import { describe, expect, it } from "vitest";
import { CaseProfile } from "../case";
import { factSheet, flashcards } from "../fact-sheet";
import { amaF1, kofiB1B2 } from "../fixtures";
import { assessMic, assessNetwork, dataEstimateMb } from "../preflight";

describe("know your file", () => {
  it("lays out the officer's facts with the numbers marked", () => {
    const sheet = factSheet(amaF1);
    const money = sheet.find((s) => s.title === "Money")!;
    expect(money.facts.find((f) => f.label === "I-20 first-year cost")).toMatchObject({ value: "$52,000", key: true });
    expect(money.facts.find((f) => f.label === "Still to show for year one")?.value).toBe("$11,000");
    expect(sheet.find((s) => s.title === "Your trip")).toBeUndefined();
    expect(factSheet(kofiB1B2).find((s) => s.title === "Your trip")).toBeDefined();
  });

  it("never shows the private post-study plan: it's coaching, not the file", () => {
    const text = JSON.stringify(factSheet(amaF1));
    expect(text).not.toContain(amaF1.study!.postStudyPlan!);
  });

  it("makes flashcards only from facts on the file", () => {
    const cards = flashcards(amaF1);
    expect(cards.find((c) => c.question.includes("sponsoring"))?.answer).toBe("Father");
    expect(cards.some((c) => c.question.includes("scholarship"))).toBe(false); // none on Ama's I-20
    const withTests = CaseProfile.parse({ ...amaF1, education: { tests: [{ name: "IELTS", score: "7.5" }] } });
    expect(flashcards(withTests).find((c) => c.question.includes("IELTS"))?.answer).toBe("7.5");
  });
});

describe("mic and connection check", () => {
  it("tells silence, quiet, clear and too loud apart", () => {
    expect(assessMic([]).ok).toBe(false);
    expect(assessMic([0.001, 0.005, 0.01]).level).toBe("bad");
    expect(assessMic([0.03, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001]).level).toBe("warn");
    expect(assessMic([0.1, 0.12, 0.08, 0.15, 0.09]).level).toBe("good");
    expect(assessMic([0.8, 0.7, 0.9]).level).toBe("warn");
  });

  it("judges the connection by its median round trip and network type", () => {
    expect(assessNetwork([120, 140, 900]).level).toBe("good");
    expect(assessNetwork([700, 800, 750]).level).toBe("warn");
    expect(assessNetwork([2000, 1800, 1900]).ok).toBe(false);
    expect(assessNetwork([100, 100, 100], "2g").ok).toBe(false);
    expect(assessNetwork([]).ok).toBe(false);
  });

  it("estimates data for the whole interview including the recording", () => {
    const d = dataEstimateMb(180);
    expect(d.low).toBeGreaterThan(10);
    expect(d.high).toBeGreaterThan(d.low);
  });
});

describe("passport expiry", () => {
  it("warns when the passport expires within six months, and shows it on the fact sheet", async () => {
    const { scanCase } = await import("../case-scan");
    const now = Date.parse("2026-09-26T00:00:00Z");
    const soon = CaseProfile.parse({ ...amaF1, applicant: { ...amaF1.applicant, passportExpiry: "2027-01-10" } });
    const fine = CaseProfile.parse({ ...amaF1, applicant: { ...amaF1.applicant, passportExpiry: "2031-01-10" } });
    expect(scanCase(soon, now).map((f) => f.id)).toContain("passport_expiry");
    expect(scanCase(fine, now).map((f) => f.id)).not.toContain("passport_expiry");
    expect(scanCase(amaF1, now).map((f) => f.id)).not.toContain("passport_expiry");
    expect(factSheet(soon).find((s) => s.title === "You")?.facts.find((f) => f.label === "Passport expires")?.value).toBe("2027-01-10");
  });
});
