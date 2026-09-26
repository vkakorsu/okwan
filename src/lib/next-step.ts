/**
 * The one thing a case should do next, from where it is. Pure, so the order
 * of the journey is testable: documents → facts → first interview → fix the
 * weakest answer → keep practising → dress rehearsal → pack → the day → how
 * did it go.
 */

export type NextStepAction =
  | { kind: "link"; href: string; label: string }
  | { kind: "session"; mode: "real" | "dress_rehearsal"; label: string }
  | { kind: "drill"; probeId: string; label: string };

export interface NextStep {
  id: string;
  title: string;
  body: string;
  action: NextStepAction;
  /** The journey so far, for the step dots. */
  progress: { documents: boolean; facts: boolean; firstInterview: boolean; rehearsal: boolean };
}

export interface NextStepInput {
  caseId: string;
  documents: { status: "pending" | "done" | "failed" }[];
  factsConfirmed: boolean;
  pendingNotes: number;
  /** Started sessions, newest first. */
  sessions: { mode: string; ended: boolean }[];
  canInterview: "full" | "free" | "none";
  /** Why no interview can start (e.g. free sessions need a confirmed email), when that's the case. */
  interviewNote?: string;
  canDrill: "full" | "free" | "none";
  /** The weakest topic to drill, if one is known. */
  weakest: { probeId: string; question: string } | null;
  daysToInterview: number | null;
  requiredStillToPack: number;
  outcomeReported: boolean;
}

export function nextStep(i: NextStepInput): NextStep {
  const interviews = i.sessions.filter((s) => s.mode !== "drill");
  const rehearsed = interviews.some((s) => s.mode === "dress_rehearsal");
  const progress = {
    documents: i.documents.some((d) => d.status === "done"),
    facts: i.factsConfirmed,
    firstInterview: interviews.some((s) => s.ended),
    rehearsal: rehearsed,
  };
  const step = (id: string, title: string, body: string, action: NextStepAction): NextStep => ({ id, title, body, action, progress });
  const buy = { kind: "link" as const, href: `/app/pass`, label: "Get interviews" };
  const days = i.daysToInterview;

  // The day has passed: the most useful thing now is the result.
  if (days !== null && days < 0 && !i.outcomeReported) {
    return step("outcome", "How did it go?", "Tell us the result and the questions you were asked. It makes the officer more realistic for the next applicant.", {
      kind: "link",
      href: `/app#outcome`,
      label: "Report your result",
    });
  }

  // Getting set up.
  if (!i.factsConfirmed) {
    if (!i.documents.length) {
      return step(
        "documents",
        "Upload your documents",
        "Your DS-160, I-20 or invitation, and bank statements. The officer uses what's in them, so the questions are about you, not anyone else.",
        { kind: "link", href: `/app/documents`, label: "Upload documents" },
      );
    }
    if (i.documents.some((d) => d.status === "pending")) {
      return step("reading", "Reading your documents", "This takes a minute. You can upload more while you wait.", {
        kind: "link",
        href: `/app/documents`,
        label: "See documents",
      });
    }
    return step("facts", "Review your facts", "Check what we read, fix anything wrong, and keep the notes that are true. The officer only uses what you confirm.", {
      kind: "link",
      href: `/app/profile`,
      label: "Review facts",
    });
  }
  if (i.pendingNotes > 0 && !progress.firstInterview) {
    return step("notes", `Keep or remove ${i.pendingNotes} note${i.pendingNotes === 1 ? "" : "s"} from your documents`, "Details only you have. The officer asks about the ones you keep.", {
      kind: "link",
      href: `/app/profile#notes`,
      label: "Review notes",
    });
  }

  // The last days: rehearse, then pack.
  if (days !== null && days >= 0 && days <= 2 && i.requiredStillToPack > 0) {
    return step("pack", "Pack your folder", `${i.requiredStillToPack} required document${i.requiredStillToPack === 1 ? "" : "s"} still to pack. Originals, in order, the night before.`, {
      kind: "link",
      href: `/app#bring`,
      label: "Open the list",
    });
  }
  if (days !== null && days >= 0 && days <= 3 && !rehearsed && progress.firstInterview) {
    return step("rehearsal", "Do a dress rehearsal", "The whole routine with a tougher officer, standing, dressed as you'll be. Best in the last three days.", i.canInterview === "full" ? { kind: "session", mode: "dress_rehearsal", label: "Start dress rehearsal" } : buy);
  }

  // Practice.
  if (!progress.firstInterview) {
    if (i.canInterview === "none") return step("buy", "Get interviews to start practising", `${i.interviewNote ?? "Your free mock is used."} Packs start at GH₵149.`, buy);
    return step(
      "first",
      i.canInterview === "free" ? "Take your free mock" : "Take your first interview",
      i.canInterview === "free" ? "90 seconds with an officer who has read your file, then an honest debrief." : "A new officer who has read your file, then an honest debrief.",
      { kind: "session", mode: "real", label: i.canInterview === "free" ? "Start free mock" : "Start" },
    );
  }
  if (i.weakest && i.canDrill !== "none") {
    return step("drill", "Fix your weakest answer", `"${i.weakest.question}" One question, a new officer, graded straight away.`, {
      kind: "drill",
      probeId: i.weakest.probeId,
      label: i.canDrill === "free" ? "Free drill" : "Drill it",
    });
  }
  if (i.canInterview === "none") return step("buy", "Keep practising", "A new officer each time until every key answer is solid.", buy);
  return step("practise", "Face another officer", "Every officer is different. Readiness grows when a second officer hears a topic answered well.", {
    kind: "session",
    mode: "real",
    label: "Start interview",
  });
}
