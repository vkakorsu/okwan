import { PageHead, Section, Table } from "@/components/admin/stat";
import { RangeTabs } from "@/components/admin/range-tabs";
import { rangeFrom, requireAdmin } from "@/lib/server/admin";

export const metadata = { title: "Funnel" };

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");

/**
 * How far the people who signed up in the range got, step by step. Each step
 * counts people who ever reached it, so it reads left to right as a journey.
 */
export default async function AdminFunnel(props: PageProps<"/admin/funnel">) {
  const { db } = await requireAdmin();
  const { range, since, label } = rangeFrom(await props.searchParams);

  let profilesQ = db.from("profiles").select("id, created_at").neq("role", "admin").limit(20000);
  if (since) profilesQ = profilesQ.gte("created_at", since);
  const [{ data: profiles }, { data: cases }, { data: docs }, { data: facts }, { data: sessions }, { data: viewed }, { data: passes }, { data: outcomes }] =
    await Promise.all([
      profilesQ,
      db.from("cases").select("id, user_id").limit(20000),
      db.from("documents").select("case_id").limit(50000),
      db.from("case_profiles").select("case_id").limit(50000),
      db.from("sessions").select("case_id, mode, started_at").not("started_at", "is", null).limit(50000),
      db.from("events").select("user_id").eq("name", "debrief_viewed").limit(50000),
      db.from("passes").select("case_id, amount_pesewas").gt("amount_pesewas", 0).limit(20000),
      db.from("outcomes").select("case_id").limit(20000),
    ]);

  // Email confirmation lives on the auth user.
  const confirmed = new Set<string>();
  for (let page = 1; page <= 20; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    for (const u of data?.users ?? []) if (u.email_confirmed_at) confirmed.add(u.id);
    if ((data?.users.length ?? 0) < 1000) break;
  }

  const people = new Set((profiles ?? []).map((p) => p.id as string));
  const caseOf = new Map<string, string>(); // case -> user
  for (const c of cases ?? []) if (people.has(c.user_id)) caseOf.set(c.id, c.user_id);
  const usersWith = (caseIds: (string | null | undefined)[]) => new Set(caseIds.flatMap((id) => (id && caseOf.has(id) ? [caseOf.get(id)!] : [])));

  const steps: [string, Set<string> | number][] = [
    ["Signed up", people.size],
    ["Confirmed email", new Set([...people].filter((u) => confirmed.has(u)))],
    ["Set up their applicant", new Set(caseOf.values())],
    ["Uploaded a document", usersWith((docs ?? []).map((d) => d.case_id))],
    ["Confirmed their facts", usersWith((facts ?? []).map((f) => f.case_id))],
    ["Did a first interview", usersWith((sessions ?? []).filter((s) => s.mode !== "drill").map((s) => s.case_id))],
    ["Opened a debrief", new Set((viewed ?? []).map((v) => v.user_id as string).filter((u) => people.has(u)))],
    ["Did a drill", usersWith((sessions ?? []).filter((s) => s.mode === "drill").map((s) => s.case_id))],
    ["Paid for a pack", usersWith((passes ?? []).map((p) => p.case_id))],
    ["Reported their real result", usersWith((outcomes ?? []).map((o) => o.case_id))],
  ];
  const counts = steps.map(([name, v]) => [name, typeof v === "number" ? v : v.size] as const);
  const top = counts[0][1];

  return (
    <>
      <PageHead title="Funnel">
        People who signed up in the {label} (admins excluded), and how many of them reached each step. The biggest drop between two steps is where
        to work next.
      </PageHead>
      <RangeTabs path="/admin/funnel" range={range} />
      <Section title="Journey">
        <Table
          head={["Step", "People", "Of sign-ups", "Of the step before", ""]}
          rows={counts.map(([name, n], i) => [
            name,
            n,
            pct(n, top),
            i === 0 ? "—" : pct(n, counts[i - 1][1]),
            <span key="b" className="block h-2 w-40 bg-fg/10" aria-hidden>
              <span className="block h-full rounded-r-[2px] bg-stamp" style={{ width: `${top ? (n / top) * 100 : 0}%` }} />
            </span>,
          ])}
          empty="No sign-ups in this range."
        />
        <p className="mt-2 text-xs text-muted">&ldquo;Opened a debrief&rdquo; is only counted from 26 Sep 2026, when usage tracking started.</p>
      </Section>
    </>
  );
}
