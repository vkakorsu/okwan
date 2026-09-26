import { track } from "@/lib/server/events";
import { after } from "next/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/app/print-button";
import type { SessionPlan } from "@/lib/domain/director";
import { stripToolText } from "@/lib/domain/transcript";
import { features } from "@/lib/env";
import { formatDate, modeLabel, outcomeLabel, TESTING_LABELS, topicLabel } from "@/lib/labels";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * A debrief shared by its owner: read-only, first name only, no recording or
 * documents. Anyone with the link can view it until it expires or is revoked.
 */
export const metadata: Metadata = {
  title: "Shared interview debrief",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

type Scores = {
  llm?: { directness: number; specificity: number; consistency: number; conciseness: number };
  testing?: string;
  probe_id?: string | null;
  stronger_answer?: string | null;
  missing_evidence?: string | null;
};

function Score({ label, v }: { label: string; v: number }) {
  return (
    <div className="text-center">
      <p className="text-lg font-semibold tabular">{v}/5</p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
}

export default async function SharedDebrief(props: PageProps<"/share/[token]">) {
  const { token } = await props.params;
  if (!features.supabaseAdmin || !/^[A-Za-z0-9_-]{32}$/.test(token)) notFound();
  const db = createServiceClient();
  const { data: share } = await db
    .from("debrief_shares")
    .select("session_id, expires_at")
    .eq("token", token)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!share) notFound();
  after(() => track(null, "share_opened", { session: share.session_id as string }));

  const { data: s } = await db
    .from("sessions")
    .select("id, case_id, plan, outcome, decision_reasons, debrief, debrief_status, started_at")
    .eq("id", share.session_id)
    .maybeSingle();
  if (!s) notFound();
  const [{ data: caseRow }, { data: turns }] = await Promise.all([
    db.from("cases").select("applicant_name, visa_type").eq("id", s.case_id).maybeSingle(),
    db
      .from("turns")
      .select("seq, officer_text, user_transcript_raw, user_transcript_corrected, user_transcript_asr, scores, red_flags")
      .eq("session_id", s.id)
      .order("seq"),
  ]);
  const plan = s.plan as SessionPlan;
  const firstName = String(caseRow?.applicant_name ?? "").split(" ")[0] || "The applicant";
  const debrief = s.debrief as { summary?: string; top_fixes?: string[] } | null;
  const answer = (t: { user_transcript_corrected: string | null; user_transcript_asr: string | null; user_transcript_raw: string | null }) =>
    (t.user_transcript_corrected ?? t.user_transcript_asr ?? t.user_transcript_raw ?? "").trim();
  const shown = (turns ?? []).filter((t) => answer(t));

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="label text-muted">Okwan · shared debrief</p>
      <h1 className="font-display mt-2 text-4xl uppercase leading-tight">
        {firstName}&rsquo;s practice interview
      </h1>
      <p className="mt-2 text-sm text-muted">
        {caseRow?.visa_type === "F1" ? "F-1 student" : "B1/B2 visitor"} · {modeLabel(plan.mode)} · {s.started_at ? formatDate(s.started_at) : ""} ·{" "}
        {plan.officer.name}
      </p>
      <p className="mt-4 rounded-[4px] border border-line p-3 text-sm text-muted">
        A practice simulation with an AI officer, shared by {firstName}. The outcome is a training signal, not a prediction of the real
        interview. This link expires on {formatDate(share.expires_at)}.
      </p>
      <div className="mt-4 print:hidden">
        <PrintButton />
      </div>

      <section className="doc mt-6 p-6">
        <p className="label text-muted">Outcome</p>
        <p className="font-display mt-1 text-3xl uppercase">{s.outcome ? outcomeLabel(s.outcome) : "No decision"}</p>
        {!!(s.decision_reasons as string[] | null)?.length && (
          <ul className="mt-2 list-disc pl-5 text-sm">
            {(s.decision_reasons as string[]).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        {debrief?.summary && <p className="mt-4 text-sm">{debrief.summary}</p>}
        {!!debrief?.top_fixes?.length && (
          <>
            <p className="label mt-4 text-muted">What to work on</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
              {debrief.top_fixes.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ol>
          </>
        )}
      </section>

      <h2 className="font-display mt-10 text-2xl uppercase">Question by question</h2>
      <ol className="mt-4 space-y-4">
        {shown.map((t) => {
          const sc = (t.scores ?? {}) as Scores;
          return (
            <li key={t.seq} className="doc break-inside-avoid p-5">
              <p className="label text-muted">
                {sc.probe_id ? topicLabel(sc.probe_id) : sc.testing ? TESTING_LABELS[sc.testing] ?? "" : ""}
              </p>
              <p className="font-voice mt-1 text-lg">Officer: &ldquo;{stripToolText(String(t.officer_text ?? ""))}&rdquo;</p>
              <p className="mt-2 text-sm">
                <span className="text-muted">{firstName}:</span> {answer(t)}
              </p>
              {sc.llm && (
                <div className="mt-3 grid grid-cols-4 gap-2 rounded-[4px] border border-line py-2">
                  <Score label="Direct" v={sc.llm.directness} />
                  <Score label="Specific" v={sc.llm.specificity} />
                  <Score label="Consistent" v={sc.llm.consistency} />
                  <Score label="Concise" v={sc.llm.conciseness} />
                </div>
              )}
              {!!(t.red_flags as string[] | null)?.length && (
                <p className="mt-2 text-sm text-refused">Red flags: {(t.red_flags as string[]).join("; ")}</p>
              )}
              {sc.stronger_answer && (
                <p className="mt-3 rounded-[4px] border border-approved/30 bg-approved/5 p-3 text-sm">
                  <span className="text-xs text-muted">A stronger answer, using only {firstName}&rsquo;s facts: </span>
                  {sc.stronger_answer}
                </p>
              )}
              {sc.missing_evidence && <p className="mt-2 text-sm text-muted">Evidence gap: {sc.missing_evidence}</p>}
            </li>
          );
        })}
      </ol>
      <p className="mt-10 text-xs text-muted">Okwan: realistic US visa interview practice for Ghanaians.</p>
    </main>
  );
}
