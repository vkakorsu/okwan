import Link from "next/link";
import { notFound } from "next/navigation";
import { retryJob } from "@/app/admin/actions";
import { PageHead, Section, Table } from "@/components/admin/stat";
import type { SessionPlan } from "@/lib/domain/director";
import { stripToolText } from "@/lib/domain/transcript";
import { recentlyAudited, requireAdmin } from "@/lib/server/admin";
import { DEBRIEF_STATUS_LABELS, formatDateTime, modeLabel, outcomeLabel, topicLabel } from "@/lib/labels";

export const metadata = { title: "Session" };

type Scores = {
  llm?: { directness: number; specificity: number; consistency: number; conciseness: number };
  probe_id?: string | null;
  stronger_answer?: string | null;
};

/**
 * One session as the applicant lived it: the plan, every turn, the officer's
 * judgements and the debrief. Only for an admin who logged a reason for this
 * session in the last 10 minutes (viewSession).
 */
export default async function AdminSession(props: PageProps<"/admin/sessions/[id]">) {
  const { admin, db } = await requireAdmin();
  const { id } = await props.params;
  const { data: s } = await db
    .from("sessions")
    .select("id, case_id, mode, is_free, outcome, decision_reasons, debrief, debrief_status, started_at, ended_at, tokens_issued, plan, cases(user_id, applicant_name)")
    .eq("id", id)
    .maybeSingle();
  if (!s) notFound();
  const owner = s.cases as unknown as { user_id: string; applicant_name: string } | null;
  const back = owner ? `/admin/users/${owner.user_id}` : "/admin/users";
  if (!(await recentlyAudited(db, admin.id, "view_session", id))) {
    return (
      <>
        <PageHead title="Session">Open this session from the user&rsquo;s page with a reason. Access is logged and lasts 10 minutes.</PageHead>
        <Link href={back} className="mt-6 inline-block underline">Back to the user</Link>
      </>
    );
  }
  const [{ data: turns }, { data: results }] = await Promise.all([
    db
      .from("turns")
      .select("seq, officer_text, user_transcript_raw, user_transcript_asr, user_transcript_corrected, started_ms, ended_ms, reply_latency_ms, interrupted, scores, red_flags")
      .eq("session_id", id)
      .order("seq"),
    db.from("probe_results").select("probe_id, quality, duration_sec, inconsistency, created_at").eq("session_id", id).order("created_at"),
  ]);
  const plan = s.plan as SessionPlan;
  const debrief = s.debrief as { summary?: string; top_fixes?: string[]; judge_agreement?: number | null } | null;

  return (
    <>
      <Link href={back} className="text-sm underline underline-offset-4">← {owner?.applicant_name ?? "User"}</Link>
      <PageHead title={`${modeLabel(s.mode, s.is_free)} · ${s.outcome ? outcomeLabel(s.outcome) : "no verdict"}`}>
        {s.started_at ? formatDateTime(s.started_at) : "Not started"} · {plan.officer.name} (pace {plan.officer.traits.pace.toFixed(2)}, scepticism{" "}
        {plan.officer.traits.scepticism.toFixed(2)}, patience {plan.officer.traits.patience.toFixed(2)}) · {s.tokens_issued ?? 0} connection(s) · Debrief:{" "}
        {DEBRIEF_STATUS_LABELS[s.debrief_status] ?? s.debrief_status}
        {debrief?.judge_agreement != null ? ` (grader agreement ${Math.round(debrief.judge_agreement * 100)}%)` : ""}
      </PageHead>
      {s.debrief_status === "failed" && (
        <form action={retryJob.bind(null, "debrief", id, back)} className="mt-4">
          <button className="rounded-[3px] border border-ink px-3 py-1.5 text-sm">Retry the debrief</button>
        </form>
      )}

      <Section title="Plan">
        <Table
          head={["Topic", "Key", "Why chosen", "Opening"]}
          rows={plan.probes.map((p) => [topicLabel(p.probeId), p.critical ? "Yes" : "", p.reason.replace("_", " "), p.entry])}
        />
        {!!s.decision_reasons?.length && <p className="mt-3 text-sm">Verdict: {(s.decision_reasons as string[]).join(" ")}</p>}
      </Section>

      <Section title="The officer's judgements">
        <Table
          head={["Topic", "Judged", "Answer length", "Mismatch with file"]}
          rows={(results ?? []).map((r) => [
            topicLabel(r.probe_id),
            r.quality,
            r.duration_sec != null ? `${r.duration_sec}s` : "—",
            r.inconsistency ? JSON.stringify(r.inconsistency) : "",
          ])}
          empty="None logged."
        />
      </Section>

      <Section title="Turn by turn">
        <ol className="space-y-3">
          {(turns ?? []).map((t) => {
            const sc = (t.scores ?? {}) as Scores;
            const answer = t.user_transcript_corrected ?? t.user_transcript_asr ?? t.user_transcript_raw ?? "";
            return (
              <li key={t.seq} className="doc p-4 text-sm">
                <p className="label text-muted">
                  #{t.seq}
                  {sc.probe_id ? ` · ${topicLabel(sc.probe_id)}` : ""}
                  {t.started_ms != null && t.ended_ms != null ? ` · ${((t.ended_ms - t.started_ms) / 1000).toFixed(1)}s` : ""}
                  {t.reply_latency_ms != null ? ` · reply ${(t.reply_latency_ms / 1000).toFixed(1)}s` : ""}
                  {t.interrupted ? " · cut off" : ""}
                </p>
                <p className="mt-1">
                  <span className="text-muted">Officer:</span> {stripToolText(String(t.officer_text ?? ""))}
                </p>
                <p className="mt-1">
                  <span className="text-muted">Applicant:</span> {answer || <em className="text-muted">nothing</em>}
                </p>
                {t.user_transcript_raw && t.user_transcript_asr != null && t.user_transcript_raw !== t.user_transcript_asr && (
                  <p className="mt-1 text-xs text-muted">Live transcript: {t.user_transcript_raw}</p>
                )}
                {sc.llm && (
                  <p className="mt-1 text-xs text-muted">
                    Direct {sc.llm.directness} · Specific {sc.llm.specificity} · Consistent {sc.llm.consistency} · Concise {sc.llm.conciseness}
                    {(t.red_flags as string[] | null)?.length ? ` · Red flags: ${(t.red_flags as string[]).join("; ")}` : ""}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </Section>

      {debrief?.summary && (
        <Section title="Debrief">
          <p className="text-sm">{debrief.summary}</p>
          <ol className="mt-2 list-decimal pl-5 text-sm">{(debrief.top_fixes ?? []).map((f) => <li key={f}>{f}</li>)}</ol>
        </Section>
      )}
    </>
  );
}
