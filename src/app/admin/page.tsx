import Link from "next/link";
import { DailyBars } from "@/components/admin/daily-bars";
import { PageHead, Section, Stat, Table } from "@/components/admin/stat";
import { daysAgo, ghs, requireAdmin } from "@/lib/server/admin";
import { capitalize, formatDateTime, packLabel } from "@/lib/labels";

const nowMs = () => Date.now();
const count = (r: { count: number | null }) => r.count ?? 0;

export default async function AdminOverview() {
  const { db } = await requireAdmin();
  const now = nowMs();
  const since14 = daysAgo(13, now).slice(0, 10);

  const [users, users7, cases, sessionsRes, passesRes, outcomesRes, failedDebriefs, recentRes] = await Promise.all([
    db.from("profiles").select("id", { count: "exact", head: true }),
    db.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", daysAgo(7, now)),
    db.from("cases").select("id", { count: "exact", head: true }),
    db.from("sessions").select("created_at, is_free, case_id").gte("created_at", `${since14}T00:00:00Z`).not("started_at", "is", null).limit(20000),
    db.from("passes").select("plan, amount_pesewas, purchased_at, case_id").limit(20000),
    db.from("outcomes").select("result").limit(20000),
    db.from("sessions").select("id", { count: "exact", head: true }).eq("debrief_status", "failed").gte("created_at", daysAgo(7, now)),
    db.from("profiles").select("id, email, role, created_at").order("created_at", { ascending: false }).limit(5),
  ]);

  const sessions = sessionsRes.data ?? [];
  const byDay = new Map<string, number>();
  for (let i = 13; i >= 0; i--) byDay.set(daysAgo(i, now).slice(0, 10), 0);
  for (const s of sessions) {
    const d = s.created_at.slice(0, 10);
    if (byDay.has(d)) byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  const today = new Date(now).toISOString().slice(0, 10);
  const sessions7 = sessions.filter((s) => s.created_at >= daysAgo(7, now)).length;

  const passes = passesRes.data ?? [];
  const paid = passes.filter((p) => p.amount_pesewas > 0);
  const revenue30 = paid.filter((p) => p.purchased_at >= daysAgo(30, now)).reduce((s, p) => s + p.amount_pesewas, 0);
  const revenueAll = paid.reduce((s, p) => s + p.amount_pesewas, 0);
  const byPlan = new Map<string, { n: number; gross: number }>();
  for (const p of paid) {
    const cur = byPlan.get(p.plan) ?? { n: 0, gross: 0 };
    byPlan.set(p.plan, { n: cur.n + 1, gross: cur.gross + p.amount_pesewas });
  }

  const practising = new Set(sessions.map((s) => s.case_id));
  const paying = new Set(paid.map((p) => p.case_id));
  const converted = [...practising].filter((c) => paying.has(c)).length;

  const outcomes = outcomesRes.data ?? [];
  const approved = outcomes.filter((o) => o.result === "approved").length;

  return (
    <>
      <PageHead title="Overview">Everything here is live from the database. Money is in cedis, VAT included.</PageHead>

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Accounts" value={count(users)} sub={`people signed up · ${count(users7)} new this week`} />
        <Stat label="Set up to practise" value={count(cases)} sub="accounts that entered their applicant details" />
        <Stat label="Mock interviews" value={byDay.get(today) ?? 0} sub={`today · ${sessions7} this week`} />
        <Stat label="Sales, last 30 days" value={ghs(revenue30)} sub={`${ghs(revenueAll)} since launch`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="relative">
          <DailyBars label="Mock interviews per day, last 14 days" data={[...byDay].map(([day, value]) => ({ day, value }))} />
          {sessions.length === 0 && (
            <p className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-sm text-muted">No mock interviews yet.</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Stat
            label="Bought a pack"
            value={practising.size ? `${Math.round((converted / practising.size) * 100)}%` : "–"}
            sub={`of applicants who practised in the last 14 days (${converted} of ${practising.size})`}
          />
          <Stat label="Real results reported" value={outcomes.length} sub={outcomes.length ? `${approved} approved` : "after their embassy interview"} />
          <Stat label="Paying customers" value={paying.size} sub="applicants who bought a pack, all time" />
          <Stat label="Debriefs that failed" value={count(failedDebriefs)} sub="this week · should stay at 0" />
        </div>
      </div>

      <Section title="Newest accounts">
        <Table
          head={["Email", "Role", "Joined", ""]}
          rows={(recentRes.data ?? []).map((u) => [
            u.email ?? "—",
            capitalize(u.role),
            formatDateTime(u.created_at),
            <Link key="l" href={`/admin/users/${u.id}`} className="underline underline-offset-4">
              Open
            </Link>,
          ])}
          empty="No accounts yet."
        />
      </Section>

      <Section title="Sales by plan">
        <Table
          head={["Plan", "Sold", "Total"]}
          rows={[...byPlan].sort((a, b) => b[1].gross - a[1].gross).map(([plan, v]) => [packLabel(plan), v.n, ghs(v.gross)])}
          empty="No paid packs yet."
        />
      </Section>
    </>
  );
}
