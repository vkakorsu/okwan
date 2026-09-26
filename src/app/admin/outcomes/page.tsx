import { PageHead, Section, Stat, Table } from "@/components/admin/stat";
import { LEVEL_LABELS, readiness, readinessTopics, type ReadinessLevel } from "@/lib/domain/readiness";
import { requireAdmin } from "@/lib/server/admin";
import { latestProfile, pastSessions } from "@/lib/server/repo";

export const metadata = { title: "Real outcomes" };

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");

export default async function AdminOutcomes() {
  const { db } = await requireAdmin();
  const { data } = await db
    .from("outcomes")
    .select("case_id, result, reported_questions, consent_to_aggregate, reported_at, cases(visa_type, interview_at, sessions(is_free, mode, outcome))")
    .order("reported_at", { ascending: false })
    .limit(5000);
  const rows = (data ?? []).map((o) => {
    const c = o.cases as unknown as { visa_type: string; sessions: { is_free: boolean; mode: string; outcome: string | null }[] } | null;
    const full = (c?.sessions ?? []).filter((s) => !s.is_free);
    return { ...o, visa: c?.visa_type ?? "?", full: full.length, rehearsed: full.some((s) => s.mode === "dress_rehearsal") };
  });

  const group = (filter: (r: (typeof rows)[number]) => boolean) => {
    const g = rows.filter(filter);
    return { n: g.length, approved: g.filter((r) => r.result === "approved").length };
  };
  const heavy = group((r) => r.full >= 3);
  const light = group((r) => r.full < 3);
  const f1 = group((r) => r.visa === "F1");
  const b = group((r) => r.visa === "B1B2");
  const questions = rows.filter((r) => r.consent_to_aggregate).flatMap((r) => r.reported_questions ?? []);
  const freq = new Map<string, number>();
  for (const q of questions) freq.set(q.toLowerCase(), (freq.get(q.toLowerCase()) ?? 0) + 1);

  const topReported = [...freq].sort((a, b) => b[1] - a[1]).slice(0, 100);

  // Readiness as it stood on the interview day (or when the result was reported), per reported case.
  const levels: ReadinessLevel[] = ["not_started", "building", "getting_close", "nearly_ready", "well_prepared"];
  const byLevel = new Map<ReadinessLevel, { n: number; approved: number }>(levels.map((l) => [l, { n: 0, approved: 0 }]));
  await Promise.all(
    (data ?? []).slice(0, 500).map(async (o) => {
      const c = o.cases as unknown as { interview_at: string | null } | null;
      const at = Math.min(Date.parse(c?.interview_at ?? o.reported_at), Date.parse(o.reported_at));
      const [current, history] = await Promise.all([latestProfile(db, o.case_id), pastSessions(db, o.case_id)]);
      if (!current) return;
      const before = history.filter((s) => !s.at || Date.parse(s.at) <= at);
      const r = readiness(before, readinessTopics(current.profile), at);
      const bucket = byLevel.get(r.level)!;
      bucket.n++;
      if (o.result === "approved") bucket.approved++;
    }),
  );

  return (
    <>
      <PageHead title="Real outcomes">
        Results users reported after their real interview. <strong>This is not proof that Okwan works.</strong> People who practise more also
        tend to have stronger cases, and people who were approved are more likely to report. Publish these numbers only with that caveat.
      </PageHead>
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Reported" value={rows.length} />
        <Stat label="Approved" value={pct(rows.filter((r) => r.result === "approved").length, rows.length)} />
        <Stat label="F-1 approved" value={pct(f1.approved, f1.n)} sub={`${f1.n} reports`} />
        <Stat label="B1/B2 approved" value={pct(b.approved, b.n)} sub={`${b.n} reports`} />
      </div>

      <Section title="By amount of practice">
        <Table
          head={["Group", "Reports", "Approved"]}
          rows={[
            ["3 or more full mocks", heavy.n, pct(heavy.approved, heavy.n)],
            ["Fewer than 3", light.n, pct(light.approved, light.n)],
          ]}
        />
      </Section>

      <Section
        title="By readiness on interview day"
        note="Readiness measures preparation, not case strength, so it shouldn't predict approval on its own. What to watch for: well-prepared applicants refused on answers they had practised, which would mean readiness over-credits something."
      >
        <Table
          head={["Readiness on the day", "Reports", "Approved"]}
          rows={levels.map((l) => [LEVEL_LABELS[l], byLevel.get(l)!.n, pct(byLevel.get(l)!.approved, byLevel.get(l)!.n)])}
        />
      </Section>

      <Section title="Questions applicants say they were asked" note="Only from users who consented. This feeds the probe taxonomy and the Reported Questions pages.">
        <Table
          head={["Question", "Times reported"]}
          rows={topReported.map(([q, n]) => [q, n])}
          sortValues={topReported.map(([q, n]) => [q, n])}
          csvName="okwan-reported-questions"
          empty="None yet."
        />
      </Section>
    </>
  );
}
