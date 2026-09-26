import { DailyBars } from "@/components/admin/daily-bars";
import { PageHead, Section, Stat, Table } from "@/components/admin/stat";
import { RangeTabs } from "@/components/admin/range-tabs";
import { MODE_INFO } from "@/lib/modes";
import { daysAgo, rangeFrom, requireAdmin } from "@/lib/server/admin";
import { EVENT_NAMES } from "@/lib/server/events";

export const metadata = { title: "Usage" };

/** What people actually use, and how active they are. Feature counts start on 26 Sep 2026, when tracking began. */
export default async function AdminUsage(props: PageProps<"/admin/usage">) {
  const { db } = await requireAdmin();
  const { range, since, label } = rangeFrom(await props.searchParams);
  const from = since ?? "1970-01-01T00:00:00Z";
  const [{ data: events }, { data: sessions }] = await Promise.all([
    db.from("events").select("name, user_id").gte("at", from).limit(100000),
    db.from("sessions").select("case_id, mode, is_free, started_at").not("started_at", "is", null).gte("started_at", from).limit(50000),
  ]);

  const byEvent = new Map<string, { n: number; users: Set<string> }>();
  for (const e of events ?? []) {
    const cur = byEvent.get(e.name) ?? { n: 0, users: new Set<string>() };
    cur.n++;
    if (e.user_id) cur.users.add(e.user_id);
    byEvent.set(e.name, cur);
  }
  const features = Object.entries(EVENT_NAMES).map(([k, labelText]) => ({ label: labelText, n: byEvent.get(k)?.n ?? 0, users: byEvent.get(k)?.users.size ?? 0 }));

  const all = sessions ?? [];
  const activeIn = (days: number) => new Set(all.filter((s) => s.started_at! >= daysAgo(days)).map((s) => s.case_id)).size;
  const days = range === "7" ? 7 : 30;
  const perDay = new Map<string, Set<string>>();
  for (let i = days - 1; i >= 0; i--) perDay.set(daysAgo(i).slice(0, 10), new Set());
  for (const s of all) perDay.get(s.started_at!.slice(0, 10))?.add(s.case_id);
  const modes = (["real", "practice", "dress_rehearsal", "drill"] as const).map((m) => {
    const list = all.filter((s) => s.mode === m);
    return { name: MODE_INFO[m].name, n: list.length, free: list.filter((s) => s.is_free).length };
  });

  return (
    <>
      <PageHead title="Usage">What applicants use in the {label}. Feature counts started on 26 Sep 2026.</PageHead>
      <RangeTabs path="/admin/usage" range={range} />
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Practised today" value={activeIn(1)} sub="applicants with a session in 24 h" />
        <Stat label="This week" value={activeIn(7)} sub="applicants" />
        <Stat label="This month" value={activeIn(30)} sub="applicants" />
        <Stat label="Sessions" value={all.length} sub={label} />
      </div>
      <div className="mt-4">
        <DailyBars label={`Applicants practising per day, last ${days} days`} data={[...perDay].map(([day, set]) => ({ day, value: set.size }))} />
      </div>
      <Section title="Features">
        <Table
          head={["Feature", "Times", "People"]}
          rows={features.map((f) => [f.label, f.n, f.users])}
          sortValues={features.map((f) => [f.label, f.n, f.users])}
          initialSort={{ col: 2, dir: "desc" }}
          csvName={`okwan-usage-${range}`}
        />
      </Section>
      <Section title="Sessions by mode">
        <Table
          head={["Mode", "Sessions", "Of them free"]}
          rows={modes.map((m) => [m.name, m.n, m.free])}
          sortValues={modes.map((m) => [m.name, m.n, m.free])}
        />
      </Section>
    </>
  );
}
