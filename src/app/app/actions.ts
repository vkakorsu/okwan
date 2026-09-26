"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DOCUMENT_READS_PER_DAY, MAX_DOCUMENTS } from "@/lib/domain/abuse";
import { CaseProfile } from "@/lib/domain/case";
import { CHECKLIST_ID } from "@/lib/domain/checklist";
import { ExtractedFacts } from "@/lib/domain/draft";
import { profileCandidate } from "@/lib/domain/profile-input";
import { NOTE_PROBE_PREFIX, planDrill, planSession, type SessionMode } from "@/lib/domain/director";
import { CASE_PROBE_PREFIX, usableCaseQuestions } from "@/lib/domain/case-questions";
import { isOnScreen, type CaseNote, type NoteCategory } from "@/lib/domain/notes";
import { officerFileText } from "@/lib/domain/officer-prompt";
import type { PackId } from "@/lib/domain/credits";
import { FREE_MOCK_SECONDS } from "@/lib/domain/entitlement";
import { MAX_CASES_PER_ACCOUNT, sameApplicant } from "@/lib/domain/identity";
import { readinessTopics } from "@/lib/domain/readiness";
import { env, features } from "@/lib/env";
import { requireUser } from "@/lib/server/auth";
import { runCaseQuestions, runDebrief, runExtraction } from "@/lib/server/jobs";
import { initializeTransaction, priceFor, PURCHASABLE } from "@/lib/server/paystack";
import {
  caseDrillEntitlement,
  caseEntitlement,
  getCase,
  latestProfile,
  pastSessions,
  readinessFrom,
  reportedShares,
  type CaseRow,
} from "@/lib/server/repo";
import { createServiceClient } from "@/lib/supabase/server";

const PLANNER_VERSION = "director-v1";

/* ----------------------------------------------------------------- cases */

const NewCase = z.object({
  visaType: z.enum(["F1", "B1B2"]),
  applicantName: z.string().trim().min(1).max(80),
  interviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined)),
  /** Answers from the free Case Scan (src/lib/domain/quick-scan.ts), as a draft to confirm. */
  scan: z.string().max(20_000).optional(),
});

export async function createCase(formData: FormData) {
  const { user, supabase } = await requireUser();
  const input = NewCase.parse(Object.fromEntries(formData));
  const { count } = await supabase.from("cases").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_CASES_PER_ACCOUNT) redirect("/app");
  const { data, error } = await supabase
    .from("cases")
    .insert({
      user_id: user.id,
      visa_type: input.visaType,
      applicant_name: input.applicantName,
      interview_at: input.interviewDate ? `${input.interviewDate}T09:00:00Z` : null,
      draft_profile: scanDraft(input.scan, input.visaType),
    })
    .select("id")
    .single();
  // A double submit hits the one-per-account index: the first one won.
  if (error?.code === "23505") redirect("/app");
  if (error) throw error;
  redirect(`/app/cases/${data.id}`);
}

function scanDraft(raw: string | undefined, visaType: "F1" | "B1B2"): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = ExtractedFacts.safeParse(JSON.parse(raw));
    if (!parsed.success || (parsed.data.visaType && parsed.data.visaType !== visaType)) return {};
    // Only profile facts; nothing that looks like a document reading.
    const { applicant, study, visit, funding, ties, history, usContacts } = parsed.data;
    return JSON.parse(JSON.stringify({ applicant, study, visit, funding, ties, history, usContacts }));
  } catch {
    return {};
  }
}

/** Tick or untick "in my folder" on the What to bring list. */
export async function setPacked(caseId: string, itemId: string, isPacked: boolean) {
  const { supabase } = await requireUser();
  const caseRow = await getCase(supabase, caseId);
  if (!caseRow) throw new Error("Case not found");
  const id = z.string().regex(CHECKLIST_ID).parse(itemId);
  const current = new Set<string>(caseRow.checklist_packed ?? []);
  if (isPacked) current.add(id);
  else current.delete(id);
  await createServiceClient().from("cases").update({ checklist_packed: [...current] }).eq("id", caseId);
  revalidatePath(`/app/cases/${caseId}`);
  revalidatePath(`/app/cases/${caseId}/social`);
}

export async function setInterviewDate(caseId: string, formData: FormData) {
  const { supabase } = await requireUser();
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(formData.get("interviewDate"));
  const caseRow = await getCase(supabase, caseId);
  if (!caseRow) throw new Error("Case not found");
  // Only for the countdown and reminders: it never controls what anyone can use.
  const newDate = new Date(`${date}T09:00:00Z`);
  if (newDate.getTime() < Date.now() - 24 * 60 * 60 * 1000) redirect(`/app/cases/${caseId}?notice=date-in-past`);
  await supabase.from("cases").update({ interview_at: newDate.toISOString() }).eq("id", caseId);
  redirect(`/app/cases/${caseId}`);
}

/* ------------------------------------------------------------- documents */

const DocKind = z.enum([
  "ds160", "i20", "ds2019", "admission_letter", "scholarship_letter", "academic_record", "bank_statement", "sponsor_letter", "employment_letter",
  "business_registration", "property", "invitation_letter", "refusal_letter", "appointment_confirmation",
  "passport_travel_page", "other",
]);

/**
 * Every upload or re-read is one Gemini call, so they're counted per account
 * per day (src/lib/domain/abuse.ts). Returns why not, or null and records the read.
 */
async function claimDocumentRead(caseId: string): Promise<string | null> {
  const admin = createServiceClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin.from("document_reads").select("id", { count: "exact", head: true }).eq("case_id", caseId).gte("at", since);
  if ((count ?? 0) >= DOCUMENT_READS_PER_DAY) return "You've uploaded or re-read a lot of documents today. Try again tomorrow.";
  await admin.from("document_reads").insert({ case_id: caseId });
  return null;
}

/** Called after the browser uploads the file to Storage under "<user_id>/<case_id>/…". */
export async function registerDocument(caseId: string, kind: string, storagePath: string): Promise<{ id: string } | { error: string }> {
  const { user, supabase } = await requireUser();
  const docKind = DocKind.parse(kind);
  if (!storagePath.startsWith(`${user.id}/${caseId}/`)) throw new Error("Invalid path");
  const { count } = await supabase.from("documents").select("id", { count: "exact", head: true }).eq("case_id", caseId);
  const refused =
    (count ?? 0) >= MAX_DOCUMENTS
      ? `You have ${MAX_DOCUMENTS} documents. Delete one you don't need, then upload this one.`
      : await claimDocumentRead(caseId);
  if (refused) {
    // The file is already in Storage; don't keep what we won't read.
    await createServiceClient().storage.from("documents").remove([storagePath]);
    return { error: refused };
  }
  const { data, error } = await supabase
    .from("documents")
    .insert({ case_id: caseId, kind: docKind, storage_path: storagePath })
    .select("id")
    .single();
  if (error) throw error;
  if (features.gemini && features.supabaseAdmin) after(() => runExtraction(data.id));
  return { id: data.id as string };
}

/** Reads a document again: after a failure (usually a brief overload), or to pick up newer reading. */
export async function retryExtraction(documentId: string) {
  const { supabase } = await requireUser();
  // RLS: only the owner can see the row.
  const { data } = await supabase.from("documents").select("case_id, extraction_status").eq("id", documentId).maybeSingle();
  if (!data) return;
  if (data.extraction_status !== "pending" && features.gemini && features.supabaseAdmin) {
    if (await claimDocumentRead(data.case_id)) redirect(`/app/cases/${data.case_id}/documents?notice=reads-limit`);
    await createServiceClient().from("documents").update({ extraction_status: "pending", extraction_error: null }).eq("id", documentId);
    after(() => runExtraction(documentId));
  }
  redirect(`/app/cases/${data.case_id}/documents`);
}

export async function deleteDocument(documentId: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("documents").select("storage_path, case_id").eq("id", documentId).maybeSingle();
  if (!data) return;
  await supabase.storage.from("documents").remove([data.storage_path]);
  // Confirmed notes are the user's facts and stay; undecided ones go with the document.
  await createServiceClient().from("case_notes").delete().eq("document_id", documentId).neq("status", "confirmed");
  await supabase.from("documents").delete().eq("id", documentId);
  redirect(`/app/cases/${data.case_id}/documents`);
}

/* --------------------------------------------------------------- profile */

const list = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export type ConfirmState = { error?: string };

export async function confirmProfile(caseId: string, _prev: ConfirmState, f: FormData): Promise<ConfirmState> {
  const { supabase } = await requireUser();
  const caseRow = await getCase(supabase, caseId);
  if (!caseRow) return { error: "Case not found." };
  const current = await latestProfile(supabase, caseId);

  const candidate = profileCandidate(f.entries(), {
    visaType: caseRow.visa_type,
    version: (current?.version ?? 0) + 1,
    fallbackFirstName: caseRow.applicant_name.split(" ")[0],
  });

  const parsed = CaseProfile.safeParse(candidate);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: `Please check "${first.path.join(" → ")}": ${first.message}` };
  }
  if (caseRow.identity_locked_at && current) {
    const check = sameApplicant(current.profile, parsed.data);
    if (!check.ok) {
      return {
        error: `The ${check.field} can't change: this account and its credits belong to one applicant. If something was entered wrongly, contact support. Someone else practising needs their own account.`,
      };
    }
  }
  const { error } = await supabase
    .from("case_profiles")
    .insert({ case_id: caseId, version: parsed.data.version, profile: parsed.data });
  if (error) return { error: error.message };
  // The user has settled what's true, so earlier disagreements are resolved.
  const { _conflicts: _resolved, ...draft } = (caseRow.draft_profile ?? {}) as Record<string, unknown>;
  void _resolved;
  await createServiceClient().from("cases").update({ draft_profile: draft }).eq("id", caseId);
  // Questions only this applicant would get, written from the new facts.
  if (features.gemini && features.supabaseAdmin) after(() => runCaseQuestions(caseId));
  redirect(`/app/cases/${caseId}?notice=profile-confirmed`);
}

/* -------------------------------------------------------------- sessions */

/** What the Director needs besides the profile and history: notes, folder, per-applicant questions, Accra reports. */
async function planContext(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], caseRow: CaseRow, profile: CaseProfile) {
  const [{ data: noteRows }, { data: docRows }, shares] = await Promise.all([
    supabase.from("case_notes").select("id, source_kind, category, text").eq("case_id", caseRow.id).eq("status", "confirmed"),
    supabase.from("documents").select("kind").eq("case_id", caseRow.id),
    reportedShares(caseRow.visa_type),
  ]);
  const notes: CaseNote[] = (noteRows ?? []).map((n) => ({
    id: n.id,
    sourceKind: n.source_kind,
    category: n.category as NoteCategory,
    text: n.text,
  }));
  const fileText = officerFileText(profile, notes.filter((n) => isOnScreen(n.sourceKind)).map((n) => n.text));
  return {
    notes,
    folder: (docRows ?? []).map((d) => d.kind as string),
    // Checked again against today's file; a stored question is never trusted on its own.
    caseQuestions: usableCaseQuestions(caseRow.case_questions, profile, fileText),
    reportedShares: shares,
  };
}

export async function startSession(caseId: string, requestedMode: SessionMode) {
  const { supabase } = await requireUser();
  const caseRow = await getCase(supabase, caseId);
  if (!caseRow) throw new Error("Case not found");
  const current = await latestProfile(supabase, caseId);
  if (!current) redirect(`/app/cases/${caseId}/profile`);

  const ent = await caseEntitlement(supabase, caseRow);
  if (ent.kind === "none") redirect(`/app/cases/${caseId}/pass?reason=${encodeURIComponent(ent.reason)}`);

  const history = await pastSessions(supabase, caseId);
  const topics = readinessTopics(current.profile);
  const mode: SessionMode = ent.kind === "free" ? "real" : requestedMode;
  const seed = randomUUID();
  const plan = planSession({
    profile: current.profile,
    pastSessions: history,
    readiness: readinessFrom(history, topics),
    mode,
    seed,
    ...(await planContext(supabase, caseRow, current.profile)),
  });
  if (ent.kind === "free") {
    plan.targetDurationSec = FREE_MOCK_SECONDS;
    // Two topics; if there's a question only they would get, it's one of them.
    const own = plan.probes.find((p) => p.probeId.startsWith(NOTE_PROBE_PREFIX) || p.probeId.startsWith(CASE_PROBE_PREFIX));
    const rest = plan.probes.filter((p) => p !== own);
    plan.probes = own ? [rest.find((p) => p.critical) ?? rest[0], own] : rest.slice(0, 2);
  }

  // Sessions are written by the server only (users can't forge plans).
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("sessions")
    .insert({
      case_id: caseId,
      profile_version: current.version,
      mode,
      plan,
      seed,
      planner_version: PLANNER_VERSION,
      is_free: ent.kind === "free",
    })
    .select("id")
    .single();
  if (error) throw error;

  // Lock the applicant identity after the first full mock (docs/PRICING.md §3a).
  if (ent.kind === "full" && !caseRow.identity_locked_at) {
    await admin.from("cases").update({ identity_locked_at: new Date().toISOString() }).eq("id", caseId);
  }
  redirect(`/app/sessions/${data.id}`);
}

/** One question, answered, graded, again: the fastest way to fix a weak answer. */
export async function startDrill(caseId: string, probeId: string) {
  const { supabase } = await requireUser();
  const caseRow = await getCase(supabase, caseId);
  if (!caseRow) throw new Error("Case not found");
  const current = await latestProfile(supabase, caseId);
  if (!current) redirect(`/app/cases/${caseId}/profile`);

  const ent = await caseDrillEntitlement(supabase, caseRow);
  if (ent.kind === "none") redirect(`/app/cases/${caseId}/pass?reason=${encodeURIComponent(ent.reason)}`);

  const [history, context] = await Promise.all([pastSessions(supabase, caseId), planContext(supabase, caseRow, current.profile)]);
  const topics = readinessTopics(current.profile);
  const seed = randomUUID();
  const plan = planDrill(
    {
      profile: current.profile,
      pastSessions: history,
      readiness: readinessFrom(history, topics),
      mode: "drill",
      seed,
      ...context,
    },
    z.string().max(80).parse(probeId),
  );
  if (!plan) redirect(`/app/cases/${caseId}?notice=drill-unavailable`);

  const { data, error } = await createServiceClient()
    .from("sessions")
    .insert({
      case_id: caseId,
      profile_version: current.version,
      mode: "drill",
      plan,
      seed,
      planner_version: PLANNER_VERSION,
      is_free: ent.kind === "free",
    })
    .select("id")
    .single();
  if (error) throw error;
  redirect(`/app/sessions/${data.id}`);
}

export async function rateSession(sessionId: string, rating: number) {
  const { supabase } = await requireUser();
  await supabase.from("sessions").update({ realism_rating: z.number().int().min(1).max(5).parse(rating) }).eq("id", sessionId);
}

/* --------------------------------------------------------------- billing */

export async function buyPlan(caseId: string, plan: PackId) {
  const { user, supabase } = await requireUser();
  if (!features.paystack) redirect("/setup");
  if (!PURCHASABLE.includes(plan)) throw new Error("Unknown plan");
  const caseRow = await getCase(supabase, caseId);
  if (!caseRow) throw new Error("Case not found");

  const reference = `okw_${randomUUID().replace(/-/g, "")}`;
  const tx = await initializeTransaction({
    // Accounts are email and password, so there's always an email for Paystack's receipt.
    email: user.email!,
    amountPesewas: priceFor(plan),
    reference,
    callbackUrl: `${env.siteUrl}/app/billing/return`,
    metadata: { case_id: caseId, user_id: user.id, plan },
  });
  redirect(tx.authorization_url);
}

/* -------------------------------------------------------------- outcomes */

export async function reportOutcome(caseId: string, formData: FormData) {
  const { supabase } = await requireUser();
  const result = z.enum(["approved", "administrative_221g", "refused_214b", "refused_other"]).parse(formData.get("result"));
  await supabase.from("outcomes").upsert({
    case_id: caseId,
    result,
    reported_questions: list(formData.get("questions")),
    consent_to_aggregate: formData.get("consent") === "on",
  });
  redirect(`/app/cases/${caseId}?notice=outcome-thanks`);
}

/* ------------------------------------------------------ transcript fixes */

const MAX_REGRADES = 5;

/**
 * Speech recognition mis-hears accented English. The user can correct what
 * they said; the debrief is then graded again from the corrected words.
 */
export async function correctTranscript(sessionId: string, seq: number, formData: FormData) {
  const { supabase } = await requireUser();
  const text = z.string().trim().min(1).max(4000).parse(formData.get("answer"));
  const { data: session } = await supabase.from("sessions").select("id, debrief").eq("id", sessionId).maybeSingle();
  if (!session) throw new Error("Session not found");
  const regrades = Number((session.debrief as { regrades?: number } | null)?.regrades ?? 0);
  if (regrades >= MAX_REGRADES) redirect(`/app/sessions/${sessionId}/debrief?notice=regrade-limit`);

  // RLS + the turns trigger only let the owner change user_transcript_corrected.
  const { error } = await supabase
    .from("turns")
    .update({ user_transcript_corrected: text })
    .eq("session_id", sessionId)
    .eq("seq", seq);
  if (error) throw error;

  const admin = createServiceClient();
  await admin
    .from("sessions")
    .update({ debrief_status: "pending", debrief: { ...((session.debrief as object) ?? {}), regrades: regrades + 1 } })
    .eq("id", sessionId);
  if (features.gemini) after(() => runDebrief(sessionId));
  redirect(`/app/sessions/${sessionId}/debrief`);
}

/** Grades a session again after grading failed. Doesn't count toward the correction limit. */
export async function retryDebrief(sessionId: string) {
  const { supabase } = await requireUser();
  const { data: session } = await supabase.from("sessions").select("debrief_status").eq("id", sessionId).maybeSingle();
  if (!session) throw new Error("Session not found");
  if (session.debrief_status === "failed" && features.gemini) {
    await createServiceClient().from("sessions").update({ debrief_status: "pending" }).eq("id", sessionId);
    after(() => runDebrief(sessionId));
  }
  redirect(`/app/sessions/${sessionId}/debrief`);
}

/* ------------------------------------------------------------ case notes */

/** Keep or remove one note from a document. Only kept notes reach the officer or coach. */
export async function setNoteStatus(noteId: string, status: "confirmed" | "removed" | "pending") {
  const { supabase } = await requireUser();
  z.enum(["confirmed", "removed", "pending"]).parse(status);
  // RLS: only the case owner can see the note.
  const { data } = await supabase.from("case_notes").select("case_id").eq("id", noteId).maybeSingle();
  if (!data) return;
  await createServiceClient()
    .from("case_notes")
    .update({ status, decided_at: status === "pending" ? null : new Date().toISOString() })
    .eq("id", noteId);
  redirect(`/app/cases/${data.case_id}/profile#notes`);
}

export async function keepAllNotes(caseId: string) {
  const { supabase } = await requireUser();
  const caseRow = await getCase(supabase, caseId);
  if (!caseRow) return;
  await createServiceClient()
    .from("case_notes")
    .update({ status: "confirmed", decided_at: new Date().toISOString() })
    .eq("case_id", caseId)
    .eq("status", "pending");
  // Kept notes from the DS-160 or I-20 are on the officer's screen: they can prompt new questions.
  if (features.gemini && features.supabaseAdmin) after(() => runCaseQuestions(caseId));
  redirect(`/app/cases/${caseId}/profile#notes`);
}

/* --------------------------------------------------------- debrief shares */

/** Active links per session: enough for a parent, a sponsor and a counsellor. */
const MAX_SHARES_PER_SESSION = 5;

export type ShareState = { url?: string; error?: string };

/** A read-only link to one debrief (src/app/share/[token]). 30 days, revocable. */
export async function createShare(sessionId: string, _prev: ShareState): Promise<ShareState> {
  void _prev;
  const { user, supabase } = await requireUser();
  // RLS: only the owner can see the session.
  const { data: session } = await supabase.from("sessions").select("id, case_id, debrief_status").eq("id", sessionId).maybeSingle();
  if (!session) return { error: "Session not found." };
  if (session.debrief_status !== "done") return { error: "Wait for the debrief to finish, then share it." };
  const admin = createServiceClient();
  const { count } = await admin
    .from("debrief_shares")
    .select("token", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString());
  if ((count ?? 0) >= MAX_SHARES_PER_SESSION) return { error: "You already have 5 active links for this debrief. Stop sharing one first." };
  const token = randomBytes(24).toString("base64url");
  const { error } = await admin.from("debrief_shares").insert({ token, session_id: sessionId, created_by: user.id });
  if (error) return { error: "Couldn't create the link. Try again." };
  revalidatePath(`/app/sessions/${sessionId}/debrief`);
  return { url: `${env.siteUrl}/share/${token}` };
}

export async function revokeShare(token: string) {
  const { supabase } = await requireUser();
  // RLS: owners can only set revoked_at on their own links.
  const { data } = await supabase
    .from("debrief_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token", z.string().regex(/^[A-Za-z0-9_-]{32}$/).parse(token))
    .select("session_id")
    .maybeSingle();
  if (data) revalidatePath(`/app/sessions/${data.session_id}/debrief`);
}
