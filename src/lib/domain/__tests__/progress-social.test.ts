import { describe, expect, it } from "vitest";
import { CHECKLIST_ID } from "../checklist";
import type { PastSession } from "../director";
import { amaF1, kofiB1B2 } from "../fixtures";
import { progress } from "../progress";
import { readiness, readinessTopics } from "../readiness";
import { socialChecklist } from "../social-check";

const NOW = Date.parse("2026-09-26T12:00:00Z");
const officer = (name: string, scepticism: number) => ({ name, voice: "v", traits: { pace: 0.5, warmth: 0.5, scepticism, patience: 0.5, silence: 0.5 } });
const session = (id: string, daysAgo: number, results: [string, "strong" | "weak"][], scepticism = 0.7): PastSession => ({
  id,
  at: new Date(NOW - daysAgo * 86400000).toISOString(),
  mode: "real",
  outcome: "approved",
  officer: officer(`Officer ${id}`, scepticism),
  askedQuestions: [],
  probeResults: results.map(([probeId, quality]) => ({ probeId, quality, officerName: `Officer ${id}` })),
});

describe("progress over time", () => {
  const topics = readinessTopics(amaF1);
  const history = [
    session("s3", 1, [["f1.funding.sponsor", "strong"], ["f1.career.after", "strong"]]),
    session("s2", 3, [["f1.funding.sponsor", "strong"], ["f1.purpose.school", "strong"]], 0.3),
    session("s1", 5, [["f1.funding.sponsor", "weak"]]),
  ];

  it("charts readiness after each session, oldest first, ending at today's score", () => {
    const p = progress(history, topics, { now: NOW });
    expect(p.points.map((x) => x.sessionId)).toEqual(["s1", "s2", "s3"]);
    expect(p.points[2].score).toBeGreaterThan(p.points[0].score);
    // The last point is readiness right after the latest session: close to today's.
    expect(Math.abs(p.points[2].score - readiness(history, topics, NOW).score)).toBeLessThan(0.05);
  });

  it("lays out each topic's answers by session", () => {
    const p = progress(history, topics, { now: NOW });
    const sponsor = p.topics.find((t) => t.id === "f1.funding.sponsor")!;
    expect(sponsor.cells).toEqual(["weak", "strong", "strong"]);
    expect(p.topics[0].critical).toBe(true);
    expect(progress(history, topics, { now: NOW, columns: 2 }).topics[0].cells).toHaveLength(2);
  });
});

describe("social media check", () => {
  it("uses ids the checklist store accepts, and personalises from the file", () => {
    const items = socialChecklist(amaF1);
    expect(items.every((i) => CHECKLIST_ID.test(i.id) && i.id.startsWith("sm_"))).toBe(true);
    expect(items.find((i) => i.id === "sm_school")?.title).toContain("University of Cincinnati");
    expect(items.find((i) => i.id === "sm_relatives")?.detail).toContain("cousin");
    expect(items.find((i) => i.id === "sm_public")?.title).toContain("public");
  });

  it("doesn't tell visitors they must go public, or show a school", () => {
    const items = socialChecklist(kofiB1B2);
    expect(items.find((i) => i.id === "sm_public")?.title).not.toMatch(/set to public/);
    expect(items.some((i) => i.id === "sm_school")).toBe(false);
  });

  it("never advises deleting or hiding", () => {
    // No sentence tells them to delete, remove, hide or lock anything.
    const sentences = socialChecklist(amaF1).flatMap((i) => `${i.title}. ${i.detail}`.split(/(?<=[.;])\s+/));
    expect(sentences.filter((x) => /^(delete|remove|hide|lock|make (it|them|your \w+) private)\b/i.test(x.trim()))).toEqual([]);
    expect(socialChecklist(amaF1).find((i) => i.id === "sm_nothing_deleted")?.detail).toContain("looks worse");
  });
});
