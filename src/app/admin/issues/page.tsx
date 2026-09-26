import Link from "next/link";
import { retryJob } from "@/app/admin/actions";
import { PageHead, Section, Stat, Table } from "@/components/admin/stat";
import { RangeTabs } from "@/components/admin/range-tabs";
import { documentLabel } from "@/lib/domain/notes";
import { capitalize, formatDateTime, modeLabel } from "@/lib/labels";
import { daysAgo, minutesAgo, rangeFrom, requireAdmin } from "@/lib/server/admin";

export const metadata = { title: "Issues" };

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");
type Owner = { user_id: string; applicant_name: string } | null;

function UserLink({ owner }: { owner: Owner }) {
  return owner ? (
    <Link href={`/admin/users/${owner.user_id}`} className="underline underline-offset-4">
      {owner.applicant_name}
    </Link>
  ) : (
    <>—</>
  );
}

/** What went wrong, where, and a way to re-run it. */
export default async function AdminIssues(props: PageProps<"/admin/issues">) {
  const { db } = await requireAdmin();
  const params = await props.searchParams;
  const { range, since, label } = rangeFrom(params);
  const from = since ?? "1970-01-01T00:00:00Z";
  const back = `/admin/issues?days=${range}`;

  const [{ data: failedDebriefs }, { data: docs }, { data: stuck }, { data: started }, { data: turns }, { count: unstartedOld }] = await Promise.all([
    db
      .from("sessions")
      .select("id, mode, is_free, started_at, cases(user_id, applicant_name)")
      .eq("debrief_status", "failed")
      .gte("started_at", from)
      .order("started_at", { ascending: false })
      .limit(200),
    db
      .from("documents")
      .select("id, kind, extraction_status, extraction_error, extraction, created_at, cases(user_id, applicant_name)")
      .gte("created_at", from)
      .order("created_at", { ascending: false })
      .limit(2000),
    db
      .from("sessions")
      .select("id, mode, started_at, cases(user_id, applicant_name)")
      .is("ended_at", null)
      .lt("started_at", minutesAgo(15))
      .gte("started_at", from)
      .limit(200),
    db.from("sessions").select("id, tokens_issued, started_at").gte("started_at", from).limit(50000),
    db
      .from("turns")
      .select("interrupted, reply_latency_ms, started_ms, sessions!inner(started_at)")
      .gte("sessions.started_at", from)
      .not("started_ms", "is", null)
      .limit(100000),
    // Clicked-but-never-started sessions older than a day: the daily cleanup should have removed them.
    db.from("sessions").select("id", { count: "exact", head: true }).is("started_at", null).lt("created_at", daysAgo(2)),
  ]);

  const failedReads = (docs ?? []).filter((d) => d.extraction_status === "failed");
  const partialReads = (docs ?? []).filter((d) => d.extraction_status === "done" && (d.extraction as { transcript?: string } | null)?.transcript === "failed");
  const sessions = started ?? [];
  const reconnected = sessions.filter((s) => (s.tokens_issued ?? 0) > 1).length;
  const answers = turns ?? [];
  const cutOff = answers.filter((t) => t.interrupted).length;

  // Reply latency by day: median and 90th percentile.
  const byDay = new Map<string, number[]>();
  for (const t of answers) {
    if (t.reply_latency_ms == null) continue;
    const day = String((t.sessions as unknown as { started_at: string }).started_at).slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), t.reply_latency_ms]);
  }
  const q = (xs: number[], p: number) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(p * s.length))];
  };
  const days = [...byDay].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 30);

  return (
    <>
      <PageHead title="Issues">What failed in the {label}, and where. Retries are logged in the audit log.</PageHead>
      {typeof params.notice === "string" && params.notice === "retrying" && (
        <p role="status" className="mt-4 rounded-[4px] border border-stamp bg-stamp/10 px-4 py-3 text-sm">Running it again. Refresh in a minute.</p>
      )}
      <RangeTabs path="/admin/issues" range={range} />
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Failed debriefs" value={failedDebriefs?.length ?? 0} sub="should be 0" />
        <Stat label="Failed document reads" value={failedReads.length} sub={`${partialReads.length} read without full text`} />
        <Stat label="Reconnected sessions" value={pct(reconnected, sessions.length)} sub={`${reconnected} of ${sessions.length} dropped and resumed`} />
        <Stat label="Answers cut off" value={pct(cutOff, answers.length)} sub={`${cutOff} of ${answers.length} answers`} />
      </div>
      {(unstartedOld ?? 0) > 0 && (
        <p className="mt-4 rounded-[4px] border border-refused/40 p-3 text-sm">
          {unstartedOld} never-started sessions are older than two days. The daily cleanup isn&rsquo;t running: check CRON_SECRET on Vercel.
        </p>
      )}

      <Section title="Failed debriefs">
        <Table
          head={["Started", "Applicant", "Mode", ""]}
          rows={(failedDebriefs ?? []).map((s) => [
            formatDateTime(s.started_at!),
            <UserLink key="u" owner={s.cases as unknown as Owner} />,
            modeLabel(s.mode, s.is_free),
            <form key="r" action={retryJob.bind(null, "debrief", s.id, back)}>
              <button className="underline underline-offset-2">Retry</button>
            </form>,
          ])}
          empty="None."
        />
      </Section>

      <Section title="Document reads that failed or came back partial">
        <Table
          head={["Uploaded", "Applicant", "Type", "Problem", ""]}
          rows={[...failedReads, ...partialReads].map((d) => [
            formatDateTime(d.created_at),
            <UserLink key="u" owner={d.cases as unknown as Owner} />,
            capitalize(documentLabel(d.kind)),
            d.extraction_status === "failed" ? d.extraction_error ?? "Failed" : "Full text missing",
            <form key="r" action={retryJob.bind(null, "extraction", d.id, back)}>
              <button className="underline underline-offset-2">Read again</button>
            </form>,
          ])}
          empty="None."
        />
      </Section>

      <Section title="Sessions stuck open" note="Started more than 15 minutes ago and never finished: usually a closed tab or a crash before saving. The applicant saw no debrief.">
        <Table
          head={["Started", "Applicant", "Mode"]}
          rows={(stuck ?? []).map((s) => [formatDateTime(s.started_at!), <UserLink key="u" owner={s.cases as unknown as Owner} />, modeLabel(s.mode)])}
          empty="None."
        />
      </Section>

      <Section title="Officer reply time by day" note="From the end of an answer to the officer's voice. Over about 2 seconds feels like lag.">
        <Table
          head={["Day", "Replies", "Median", "90th percentile"]}
          rows={days.map(([day, xs]) => [day, xs.length, `${(q(xs, 0.5) / 1000).toFixed(1)} s`, `${(q(xs, 0.9) / 1000).toFixed(1)} s`])}
          sortValues={days.map(([day, xs]) => [day, xs.length, q(xs, 0.5), q(xs, 0.9)])}
          empty="No replies timed yet."
        />
      </Section>
    </>
  );
}
