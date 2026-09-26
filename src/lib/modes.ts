/**
 * How each interview mode behaves, in plain words for users. Keep in step
 * with the planner (src/lib/domain/director.ts) and the Referee. No lengths:
 * like the real window, each officer decides when they've heard enough.
 */
export const MODE_INFO = {
  real: {
    name: "Real interview",
    body: "As close to the embassy as we can make it. A new officer who decides how long it lasts: they may cut you off, ask to see a document, or decide after two answers. Ends with approved, refused or 221(g).",
  },
  practice: {
    name: "Practice mode",
    body: "Lower stakes for working on answers. Fewer surprises, and a bad answer doesn't end it: the officer covers every topic. Still ends with a verdict and a full debrief.",
  },
  dress_rehearsal: {
    name: "Dress rehearsal",
    body: "Your final check before the real day. A tougher officer and the whole routine: passport through the slot, fingerprints at the window, several topics and a verdict. Do it standing, dressed as you'll be.",
  },
  drill: {
    name: "Drill",
    body: "One question, a new officer each time, graded straight away. No verdict. Start one from any debrief or from Answers to fix.",
  },
  free: {
    name: "Free mock",
    body: "A real interview with an officer who has read your file and decides when they've heard enough, then a verdict and a full debrief. One per account.",
  },
} as const;
