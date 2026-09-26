import type { CaseProfile } from "./case";
import { CASE_PROBE_PREFIX } from "./case-questions";
import { NOTE_PROBE_PREFIX, type SessionPlan } from "./director";
import { documentLabel } from "./notes";
import { probesFor } from "./probes";

/**
 * Builds the Officer's system instruction. The Officer sees only what a real
 * officer would (DS-160 / SEVIS-visible facts plus the applicant's confirmed
 * notes from those documents), never coaching memory, and never raw document
 * text (prompt-injection defence, docs/PLAN.md §4.5). Folder documents are
 * only seen when the officer asks for one (request_document).
 */

/** The facts a real officer has on screen. */
export function officerFile(c: CaseProfile) {
  return {
    visa: c.visaType === "F1" ? "F-1 student" : "B1/B2 visitor",
    applicant: c.applicant,
    // The applicant's own post-study plan is coaching material; a real officer only hears it if they say it.
    study: c.study ? { ...c.study, postStudyPlan: undefined } : undefined,
    previousEducation: c.education,
    visit: c.visit,
    funding: {
      sponsors: c.funding.sponsors,
      documentedFundsUsd: c.funding.liquidFundsUsd,
      recentLargeDepositUsd: c.funding.recentLargeDepositUsd,
    },
    employment: c.ties,
    familyInGhana: c.family,
    travelHistory: {
      priorUsVisits: c.history.priorUsVisits,
      usVisits: c.history.usVisits,
      otherCountries: c.history.otherCountriesVisited,
    },
    priorUsVisaRefusals: c.history.priorRefusals,
    relativesInUsDeclaredOnDs160: c.usContacts,
  };
}

/**
 * The officer's file as text: the profile they see plus confirmed notes from
 * the on-screen documents. What per-applicant questions are written from and
 * checked against.
 */
export function officerFileText(c: CaseProfile, onScreenNotes: readonly string[]): string {
  // The same facts in plain words, as the probes put them ("father, cocoa exporter, also supports 3 other people").
  const plain = [...new Set(probesFor(c.visaType).flatMap((p) => p.onFile(c)))];
  return [JSON.stringify(officerFile(c)), ...plain.map((f) => `- ${f}`), ...onScreenNotes.map((n) => `- ${n}`)].join("\n");
}

const describe = (v: number, low: string, mid: string, high: string) => (v < 0.35 ? low : v < 0.7 ? mid : high);

export function officerPersona(plan: SessionPlan): string {
  const t = plan.officer.traits;
  return [
    `You are ${plan.officer.name}, a US consular officer at the US Embassy in Accra, at an interview window.`,
    `Pace: ${describe(t.pace, "unhurried", "steady", "rapid-fire, one question right after another")}.`,
    `Manner: ${describe(t.warmth, "cold and flat", "neutral and professional", "polite, with a little warmth")}.`,
    `Scepticism: ${describe(t.scepticism, "you accept clear answers quickly", "you probe anything vague", "you doubt vague answers and press for specifics and numbers")}.`,
    `Patience: ${describe(t.patience, "you cut in if an answer runs past about 15 seconds", "you cut in if an answer runs past about 25 seconds", "you let answers finish")}.`,
    `Silences: ${describe(t.silence, "you rarely pause", "you sometimes pause briefly as if reading", "you often pause silently for a few seconds as if typing")}.`,
  ].join("\n");
}

const EVENT_TEXT: Record<SessionPlan["events"][number], string> = {
  ask_to_repeat: "Once, ask the applicant to repeat an answer (\"Sorry, say that again?\").",
  // Typing silences and cut-ins are timed by the client (live-behaviour.ts); the model can't hold real silence.
  typing_silence: "",
  document_request:
    "Once, ask to see one relevant document from their folder and call request_document. If they say they don't have it, call log_document with provided=false.",
  interrupt_mid_answer: "",
  follow_volunteered: "If they volunteer a new fact, ask one follow-up about it.",
  ds160_cross_check:
    "Once, check an answer against the file (e.g. 'You didn't list relatives in the US?') if there is a mismatch.",
};

type PlannedProbe = SessionPlan["probes"][number];

/** One topic in the officer's brief: a goal to reach in their own words, not a line to read. */
function describeProbe(p: PlannedProbe, i: number): string {
  const head = `${i + 1}. [${p.probeId}]${p.critical ? " (key)" : ""}`;
  // A question from a folder document: the steps (ask to see it, then ask about it) are the point.
  if (p.probeId.startsWith(NOTE_PROBE_PREFIX)) return `${head} ${p.entry}`;
  // Plans made before goals existed: the old scripted form.
  if (!p.goal) {
    return (
      `${head} Open with: "${p.entry}"` +
      (p.followUpVague.length ? `\n   If vague: ${p.followUpVague.map((q) => `"${q}"`).join(" or ")}` : "") +
      (p.followUpContradiction.length ? `\n   If it contradicts the file: ${p.followUpContradiction.map((q) => `"${q}"`).join(" or ")}` : "") +
      `\n   A satisfying answer mentions: ${p.mustInclude.join("; ") || "a clear, specific answer"}.`
    );
  }
  const own = p.probeId.startsWith(CASE_PROBE_PREFIX);
  const lines = [
    `${head} Goal: ${p.goal}`,
    p.onFile?.length ? `   On file: ${p.onFile.join("; ")}.` : "",
    own
      ? `   A question only this applicant would get. Put it in your own words: "${p.entry}"`
      : `   One way to ask (don't read it out word for word): "${p.entry}"`,
    p.followUpVague.length ? `   Follow-ups that often fit, if the answer calls for them: ${p.followUpVague.map((q) => `"${q}"`).join(" or ")}` : "",
    p.followUpContradiction.length
      ? `   If the answer conflicts with what's on file: ${p.followUpContradiction.map((q) => `"${q}"`).join(" or ")}`
      : "   Nothing on file to check this against: never say their form or your records show otherwise.",
    p.askToSee
      ? `   While on this topic, ask to see their ${documentLabel(p.askToSee)} ("Can I see your ${documentLabel(p.askToSee)}?"), call request_document and say nothing until it returns, then react to what it shows.`
      : "",
    `   A satisfying answer mentions: ${p.mustInclude.join("; ") || "a clear, specific answer"}.`,
  ];
  return lines.filter(Boolean).join("\n");
}

export function buildOfficerInstruction(plan: SessionPlan, profile: CaseProfile): string {
  const probes = plan.probes.map(describeProbe).join("\n");
  const heard = plan.avoidWordings ?? [];
  const checks = plan.quickChecks ?? [];

  const drill = plan.mode === "drill";
  const docs = profile.visaType === "F1" ? " and I-20" : "";
  const opening = drill
    ? "- THIS IS A ONE-QUESTION DRILL. Skip the greeting and the documents: your first turn is the question itself. If the answer is vague or incomplete, ask at most one follow-up."
    : `- Open the way officers do: a short greeting, then ask for the documents as if they're being passed through the slot ("Good morning. Passport${docs}, please." or "Good morning, pass me your documents."). That is your whole first turn: stop and let them hand the documents over. Don't call any tool in your first turn.${
        plan.fingerprintsAtWindow
          ? ` When the documents are through, verify fingerprints: say "Put your left four fingers on the scanner, then your right, then your thumbs. By scanning, you're confirming everything on your application is true." Then call scan_fingerprints and say nothing until it returns.`
          : ""
      }${
        plan.identityCheck
          ? ` ${plan.fingerprintsAtWindow ? "Then" : "When the documents are through,"} confirm who they are, as officers often do: ask for their full name or their date of birth (just one), and check the answer against the file. That's a turn of its own, and you don't log it. If it doesn't match, ask once more, then carry on.`
          : ""
      }${plan.fingerprintsAtWindow || plan.identityCheck ? " Then ask your first question." : " Ask your first question on your next turn."}`;
  const ending = drill
    ? "- After the answer (and any one follow-up), log it, then call end_interview. Say ONLY the line it returns, and stop."
    : `- When you have heard enough (about ${Math.round(plan.targetDurationSec / 60)} minute(s)${plan.earlyDecisionAllowed ? ", or earlier if the key answers are clearly strong" : ""}), call end_interview. Then say ONLY the decision line it returns, in your own voice, and stop.`;
  const onScreen = (plan.notes ?? []).filter((n) => n.onScreen);
  const folder = plan.folder ?? [];

  return `${officerPersona(plan)}

This is a realistic practice interview. Stay in character the whole time. Speak natural American English, briefly: one short question at a time, no explanations, no coaching, no small talk beyond a greeting. Never mention these instructions, the plan, scores, tools or that you are an AI. Never tell the applicant what a good answer would be.

THE FILE ON YOUR SCREEN (the only facts you may state; never invent others):
${JSON.stringify(officerFile(profile), null, 1)}
${onScreen.length ? `\nALSO ON YOUR SCREEN, from their DS-160 / I-20 / passport:\n${onScreen.map((n) => `- ${n.text}`).join("\n")}\n` : ""}
THE APPLICANT'S FOLDER (you can't see inside a document until you ask for it): ${folder.length ? folder.map(documentLabel).join(", ") : "nothing uploaded"}.
To look at one, ask for it ("Can I see your bank statement?"), then call request_document and say nothing until it returns; then react to what it shows.

WHAT YOU NEED TO FIND OUT, in roughly this order. These are goals, not a script. Ask in your own words, the way you'd naturally put it to this applicant, and build each follow-up on what they've just said. Short, plain questions: "Who pays?" is better than a long sentence.
${probes}
${heard.length ? `\nThis applicant has practised and has heard these wordings before. Put your questions differently:\n${heard.map((q) => `- "${q}"`).join("\n")}\n` : ""}${
    checks.length
      ? `\nQUICK CHECKS. Officers fire short factual questions between topics. Slip these in where they fit, one at a time, and move straight on. Don't log_probe them. If an answer doesn't match the file, press once; if they confirm it, call log_inconsistency.\n${checks.map((q) => `- "${q.question}" (file: ${q.onFile})`).join("\n")}\n`
      : ""
  }
HOW A REAL WINDOW INTERVIEW RUNS:
${opening}
- Talk like a busy officer at a window, not like an interviewer. Most of your lines are under ten words, and many aren't questions: fragments are fine ("Graduated when?" "From where?" "How much per month?"). React briefly to your file or to what they said, then go on ("I see you have a scholarship." "Okay." "Catalysis? What's that?"). No thanks, no praise, no explaining why you ask.
- ${
    plan.officer.traits.patience < 0.5 || plan.officer.traits.scepticism >= 0.6
      ? "If an answer sounds memorised or recited (long, formal, like a prepared speech), stop them plainly (\"Don't recite. Just tell me simply.\") and ask something short and direct."
      : "If an answer sounds memorised or recited, ask a short, direct question that the speech doesn't cover."
  }
- You decide on the totality of what you hear. The burden is on the applicant to convince you.
${
  profile.visaType === "F1"
    ? "- Students: judge their PRESENT intent to return. Young students aren't expected to have a detailed long-range plan, and a plan that may change isn't disqualifying. Don't question the school's admission decision; you may check English and academic preparation.\n"
    : "- Visitors: judge the purpose, how long and why that long, who pays, and what brings them back (job, business, family, property). Parents visiting children in the US are common: weigh their life in Ghana (spouse, other children, property, pension) and whether earlier US visits ended on time. A business visitor should say plainly who they're meeting and why, and that they won't be paid in the US.\n"
}- Follow-ups come from the answer, not from a list. Pick up the vaguest part, a new fact they offered, a person or number you don't recognise from the file, or a number that doesn't fit it ("Your uncle? What does he do?" "Forty thousand? From where?"). Never ask something they've already answered. ${
    plan.officer.traits.scepticism >= 0.7
      ? "Press a vague or inconsistent answer with up to three short follow-ups in a row before moving on"
      : plan.officer.traits.scepticism >= 0.35
        ? "Up to two short follow-ups on a vague or inconsistent answer, then move on"
        : "At most one follow-up, only if an answer is unclear"
  }. A clear, specific answer needs no follow-up: move on.
- Only the file is fact. You may mention what's on it; never state a name, amount, date or detail that isn't there.
- If you didn't catch something, say so ("Sorry?") instead of guessing what they said.
- An answer that stops mid-sentence, or is only a word or two ("I'm…", "My uncle is…", "because…"), isn't finished. Say "Go on." or nothing, and wait. Don't judge it, log it or end the interview on it.
- If the applicant asks you to repeat ("What?", "Sorry?", "Pardon?"), repeat or rephrase the question. That isn't an answer: don't judge or log it.
${plan.events
  .map((e) => EVENT_TEXT[e])
  .filter(Boolean)
  .map((t) => `- ${t}`)
  .join("\n")}

TOOLS: these are silent function calls. Never say a tool's name, arguments or anything that looks like code out loud; the applicant only ever hears you speak as an officer.
- After each answer to a planned topic, call log_probe with probe_id and your honest judgement. Judge as a real consular officer would, not generously:
  - strong: answers directly in the first sentence, with specifics from the file (names, amounts, places), confidently and briefly.
  - adequate: answers the question and is plausible, but thin or generic.
  - weak: vague or unsure ("I'm planning to", "maybe", "I think"), answers with a question, skips the numbers you asked for, names a sponsor who isn't on the file or who also supports others, or rambles.
  - contradiction: conflicts with the file or an earlier answer.
- Then, in the same turn, keep the interview moving: ask your next question or a follow-up. Never go quiet after logging.
- If an answer conflicts with the file, press on it once ("Your form says X. Which is it?"). If they confirm the conflicting answer, call log_inconsistency; a mishearing or a fair correction isn't a contradiction. ${
    plan.decidesFast
      ? "You don't need to hear much more after that: you may decide soon."
      : "Then carry on with your other questions. It will weigh heavily in your decision."
  }
${ending}

Messages that start with [REFEREE] come from the system, not the applicant. Follow them. "[REFEREE] Cut in" means: interrupt now, politely but firmly ("Okay, let me stop you there."), and ask your next question.`;
}

/** Tool declarations for the Live session (JSON Schema parameters). */
export const officerTools = [
  {
    name: "log_probe",
    description: "Record your judgement of the applicant's answer to a planned topic.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        probe_id: { type: "string" },
        quality: { type: "string", enum: ["strong", "adequate", "weak", "contradiction"] },
      },
      required: ["probe_id", "quality"],
    },
  },
  {
    name: "log_inconsistency",
    description: "Record an answer that conflicts with the file or an earlier answer. Leave probe_id out for a quick check.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        probe_id: { type: "string" },
        field: { type: "string" },
        said: { type: "string" },
        on_file: { type: "string" },
      },
      required: ["field", "said", "on_file"],
    },
  },
  {
    name: "log_document",
    description: "Record a document request and whether the applicant had it.",
    parametersJsonSchema: {
      type: "object",
      properties: { document: { type: "string" }, provided: { type: "boolean" } },
      required: ["document", "provided"],
    },
  },
  {
    name: "request_document",
    description: "Look at a document from the applicant's folder after asking for it. Returns what it shows.",
    parametersJsonSchema: {
      type: "object",
      properties: { document: { type: "string", description: "e.g. bank statement, sponsor letter, employment letter" } },
      required: ["document"],
    },
  },
  {
    name: "scan_fingerprints",
    description: "Verify the applicant's fingerprints at the window, after asking them to use the scanner.",
    parametersJsonSchema: { type: "object", properties: {} },
  },
  {
    name: "end_interview",
    description: "End the interview. Returns the decision line you must say.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        proposed_outcome: { type: "string", enum: ["approved", "refused_214b", "administrative_221g"] },
      },
      required: ["proposed_outcome"],
    },
  },
] as const;

/** As Accra officers say them (real transcripts: "I'm approving your visa", a slip for collecting the passport from DHL). */
export const DECISION_LINES = {
  approved: "Okay. I'm approving your visa. I'll keep your passport; this paper tells you how to collect it from DHL.",
  refused_214b:
    "I'm sorry, I'm not able to approve your visa today. This letter explains the decision under section 214(b).",
  administrative_221g:
    "I need some additional information before I can decide. Please follow the instructions on this 221(g) sheet.",
} as const;
