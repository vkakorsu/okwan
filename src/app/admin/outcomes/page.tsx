import { PageHead, Section, Stat, Table } from "@/components/admin/stat";
import { requireAdmin } from "@/lib/server/admin";

export const metadata = { title: "Real outcomes" };

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");

export default async function AdminOutcomes() {
  const { db } = await requireAdmin();
  const { data } = await db
    .from("outcomes")
    .select("result, reported_questions, consent_to_aggregate, reported_at, cases(visa_type, sessions(is_free, mode, outcome))")
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

      <Section title="Questions applicants say they were asked" note="Only from users who consented. This feeds the probe taxonomy and the Reported Questions pages.">
        <Table
          head={["Question", "Times reported"]}
          rows={topReported.map(([q, n]) => [q, n])}
          sortValues={topReported.map(([q, n]) => [q, n])}
          empty="None yet."
        />
      </Section>
    </>
  );
}
