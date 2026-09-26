import { PageHead, Section, Stat, Table } from "@/components/admin/stat";
import type { SessionPlan } from "@/lib/domain/director";
import { officerStyle, REAL_OFFICER_STYLE } from "@/lib/domain/officer-style";
import { getProbe } from "@/lib/domain/probes";
import { RangeTabs } from "@/components/admin/range-tabs";
import { officerGraderAgreement } from "@/lib/domain/judge-agreement";
import { rangeFrom, requireAdmin } from "@/lib/server/admin";
import { DEBRIEF_STATUS_LABELS, outcomeLabel, topicLabel } from "@/lib/labels";

export const metadata = { title: "Session quality" };

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");

export default async function AdminQuality(props: PageProps<"/admin/quality">) {
  const { db } = await requireAdmin();
  const { range, since: from, label } = rangeFrom(await props.searchParams);
  const since = from ?? "1970-01-01T00:00:00Z";
  const [{ data: sessionRows }, { data: probeRows }, { data: latencyRows }, { data: officerRows }, { data: pairRows }] = await Promise.all([
    // Sessions that never started (a mode clicked, then left) would skew every figure.
    db
      .from("sessions")
      .select("case_id, client_fp, plan, outcome, realism_rating, debrief_status, started_at, ended_at, mode")
      .gte("created_at", since)
      .not("started_at", "is", null)
      .limit(20000),
    db.from("probe_results").select("session_id, probe_id, quality, created_at").gte("created_at", since).limit(50000),
    db
      .from("turns")
      .select("reply_latency_ms, sessions!inner(created_at)")
      .not("reply_latency_ms", "is", null)
      .gte("sessions.created_at", since)
      .limit(50000),
    // What the officers said, to compare with real officers (drills are one question, so left out).
    db
      .from("turns")
      .select("session_id, officer_text, sessions!inner(created_at, mode)")
      .not("officer_text", "is", null)
      .neq("sessions.mode", "drill")
      .gte("sessions.created_at", since)
      .limit(50000),
    // The grader's scores per answer, to compare with the live officer's judgement of the same topic.
    db
      .from("turns")
      .select("session_id, scores, sessions!inner(created_at)")
      .not("scores", "is", null)
      .gte("sessions.created_at", since)
      .limit(100000),
  ]);
  const style = officerStyle((officerRows ?? []).map((r) => String(r.officer_text)));
  const perSession = new Map<string, number>();
  for (const r of officerRows ?? []) perSession.set(r.session_id as string, (perSession.get(r.session_id as string) ?? 0) + 1);
  const counts = [...perSession.values()].sort((a, b) => a - b);
  const medianLines = counts.length ? counts[Math.floor(counts.length / 2)] : null;
  const latencies = (latencyRows ?? []).map((r) => r.reply_latency_ms as number).sort((a, b) => a - b);
  const q = (p: number) => (latencies.length ? `${(latencies[Math.min(latencies.length - 1, Math.floor(p * latencies.length))] / 1000).toFixed(1)} s` : "–");
  const sessions = sessionRows ?? [];
  const ended = sessions.filter((s) => s.ended_at && s.started_at);
  const rated = sessions.filter((s) => s.realism_rating);
  const avgRating = rated.length ? (rated.reduce((a, s) => a + (s.realism_rating ?? 0), 0) / rated.length).toFixed(2) : "–";
  const novelty = sessions.length
    ? sessions.reduce((a, s) => a + ((s.plan as SessionPlan)?.noveltyRate ?? 0), 0) / sessions.length
    : 0;
  const avgSecs = ended.length
    ? Math.round(ended.reduce((a, s) => a + (+new Date(s.ended_at!) - +new Date(s.started_at!)) / 1000, 0) / ended.length)
    : 0;
  const outcomes = ["approved", "refused_214b", "administrative_221g", "incomplete"].map((o) => [o, ended.filter((s) => s.outcome === o).length] as const);
  const debriefs = ["done", "failed", "pending", "running"].map((d) => [d, sessions.filter((s) => s.debrief_status === d).length] as const);

  const probes = new Map<string, { n: number; weak: number; contradiction: number }>();
  for (const r of probeRows ?? []) {
    const cur = probes.get(r.probe_id) ?? { n: 0, weak: 0, contradiction: 0 };
    cur.n++;
    if (r.quality === "weak") cur.weak++;
    if (r.quality === "contradiction") cur.contradiction++;
    probes.set(r.probe_id, cur);
  }
  const byCase = new Map<string, { fps: Set<string>; n: number }>();
  for (const s of sessions) {
    if (!s.client_fp) continue;
    const cur = byCase.get(s.case_id) ?? { fps: new Set<string>(), n: 0 };
    cur.fps.add(s.client_fp);
    cur.n++;
    byCase.set(s.case_id, cur);
  }
  const sharing = [...byCase].filter(([, v]) => v.fps.size >= 3).sort((a, b) => b[1].fps.size - a[1].fps.size);

  const agreement = officerGraderAgreement(
    (probeRows ?? []).map((r) => ({ sessionId: r.session_id as string, probeId: r.probe_id as string, quality: r.quality as "strong" | "adequate" | "weak" | "contradiction" })),
    (pairRows ?? []).map((t) => ({ sessionId: t.session_id as string, scores: t.scores })),
  );

  // Worst first: the share of weak or contradictory answers. Sortable by any column.
  const struggle = [...probes].sort((a, b) => (b[1].weak + b[1].contradiction) / b[1].n - (a[1].weak + a[1].contradiction) / a[1].n);

  // A sample of how the question is asked, with case details left as "…".
  const sample = (id: string) => {
    try {
      return getProbe(id).entry[0].replace(/\{\w+\}/g, "…");
    } catch {
      return id.startsWith("case:") ? "Written for the applicant from their file" : "Built from the applicant's own documents";
    }
  };

  return (
    <>
      <PageHead title="Session quality">The {label}. Is the officer realistic, varied and fair? See docs/PLAN.md §2.2.7.</PageHead>
      <RangeTabs path="/admin/quality" range={range} />
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="“Felt real”" value={avgRating} sub={`out of 5 · ${rated.length} ratings`} />
        <Stat label="Question novelty" value={pct(novelty, 1)} sub="not asked in the user's last 3 sessions" />
        <Stat label="Sessions" value={sessions.length} sub={`${ended.length} finished`} />
        <Stat label="Average length" value={`${Math.floor(avgSecs / 60)}:${String(avgSecs % 60).padStart(2, "0")}`} sub="min:sec" />
        <Stat label="Officer reply time" value={q(0.5)} sub={`median after an answer · 90th percentile ${q(0.9)}`} />
      </div>

      <Section
        title="Does the officer talk like a real one?"
        note="Compared with 335 officer lines from real West African F-1 interviews (docs/INTERVIEW-REALISM.md §10). Real officers are terse: short lines, many of them reactions or instructions rather than questions. Well above these numbers means the officer sounds like an interviewer."
      >
        <Table
          head={["Measure", "Our officers", "Real officers"]}
          rows={[
            ["Words per line (median)", style?.medianWords ?? "–", REAL_OFFICER_STYLE.medianWords],
            ["Words per line (90th percentile)", style?.p90Words ?? "–", REAL_OFFICER_STYLE.p90Words],
            ["Lines that aren't questions", style ? pct(style.nonQuestionShare, 1) : "–", pct(REAL_OFFICER_STYLE.nonQuestionShare, 1)],
            ["Officer lines per interview (median)", medianLines ?? "–", REAL_OFFICER_STYLE.medianLinesPerInterview],
          ]}
        />
      </Section>

      <Section
        title="Does the officer judge like the grader?"
        note="The live officer's judgement of each answer next to the independent debrief grade of the same answer (graded twice, anchored scores). A big gap means the officer is too generous or too harsh on that topic; it's the early warning that live judging has drifted."
      >
        <p className="mb-3 text-sm">
          Agree on <strong>{pct(agreement.overall.agree, agreement.overall.n)}</strong> of {agreement.overall.n} answers · officer more generous on{" "}
          {pct(agreement.overall.officerHigher, agreement.overall.n)} · harsher on {pct(agreement.overall.officerLower, agreement.overall.n)}
        </p>
        <Table
          head={["Topic", "Answers", "Agree", "Officer more generous", "Officer harsher"]}
          rows={agreement.byTopic.map((t) => [topicLabel(t.probeId), t.n, pct(t.agree, t.n), pct(t.officerHigher, t.n), pct(t.officerLower, t.n)])}
          sortValues={agreement.byTopic.map((t) => [topicLabel(t.probeId), t.n, t.agree / t.n, t.officerHigher / t.n, t.officerLower / t.n])}
          initialSort={{ col: 2, dir: "asc" }}
          empty="No answers graded by both yet."
        />
      </Section>

      <Section title="Simulated outcomes" note="Share of finished sessions. If nearly everyone is approved or refused, the Referee's thresholds need tuning.">
        <Table head={["Outcome", "Sessions", "Share"]} rows={outcomes.map(([o, n]) => [outcomeLabel(o), n, pct(n, ended.length)])} />
      </Section>

      <Section title="Rating distribution">
        <Table head={["Rating", "Sessions"]} rows={[5, 4, 3, 2, 1].map((r) => [r, rated.filter((s) => s.realism_rating === r).length])} />
      </Section>

      <Section title="Where applicants struggle" note="Weak or contradictory answers by topic. Topics with a high share are candidates for new drills, guides and SEO content.">
        <Table
          head={["Topic", "Sample question", "Answers", "Weak", "Contradiction"]}
          rows={struggle.map(([id, v]) => [
            topicLabel(id),
            <span key="q" className="text-muted">{sample(id)}</span>,
            v.n,
            pct(v.weak, v.n),
            pct(v.contradiction, v.n),
          ])}
          sortValues={struggle.map(([id, v]) => [topicLabel(id), null, v.n, v.weak / v.n, v.contradiction / v.n])}
          csvName="okwan-topics"
          empty="No graded answers yet."
        />
      </Section>

      <Section
        title="Possible shared accounts"
        note="Cases practised from 3 or more different network + browser combinations in 30 days. A signal to look at, not proof: people also switch between home Wi-Fi, mobile data and work."
      >
        <Table
          head={["Case", "Different places", "Sessions"]}
          rows={sharing.map(([caseId, v]) => [
            <span key="c" className="font-mono text-xs">{caseId.slice(0, 8)}</span>,
            v.fps.size,
            v.n,
          ])}
          sortValues={sharing.map(([caseId, v]) => [caseId, v.fps.size, v.n])}
          empty="Nothing unusual."
        />
      </Section>

      <Section title="Debrief grading">
        <Table head={["Status", "Sessions"]} rows={debriefs.map(([d, n]) => [DEBRIEF_STATUS_LABELS[d] ?? d, n])} />
      </Section>
    </>
  );
}
