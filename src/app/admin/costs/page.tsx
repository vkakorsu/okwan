import { PageHead, Section, Stat, Table } from "@/components/admin/stat";
import { RangeTabs } from "@/components/admin/range-tabs";
import { env } from "@/lib/env";
import { ghs, rangeFrom, requireAdmin } from "@/lib/server/admin";

export const metadata = { title: "Costs" };

const usd = (n: number) => `$${n.toFixed(n < 10 ? 2 : 0)}`;

/**
 * What the product spends on Gemini, estimated from usage at configurable
 * rates, against what it earns. Not a bill: set COST_USD_* from the Google
 * Cloud billing report to make it accurate.
 */
export default async function AdminCosts(props: PageProps<"/admin/costs">) {
  const { db } = await requireAdmin();
  const { range, since, label } = rangeFrom(await props.searchParams);
  const rate = env.costUsd;
  const from = since ?? "1970-01-01T00:00:00Z";

  const [{ data: sessions }, { data: reads }, { data: answers }, { data: speech }, { data: passes }] = await Promise.all([
    db.from("sessions").select("id, mode, case_id, started_at, ended_at, debrief_status").gte("started_at", from).limit(50000),
    db.from("document_reads").select("at").gte("at", from).limit(50000),
    db
      .from("turns")
      .select("session_id, sessions!inner(started_at)")
      .not("user_transcript_asr", "is", null)
      .gte("sessions.started_at", from)
      .limit(100000),
    db.from("events").select("props").eq("name", "hear_it").gte("at", from).limit(50000),
    db.from("passes").select("amount_pesewas").gt("amount_pesewas", 0).gte("purchased_at", from).limit(20000),
  ]);

  const started = sessions ?? [];
  // Live minutes, capped at 10 per session so a stuck session doesn't distort the total.
  const minutes = started.reduce((a, s) => {
    const end = s.ended_at ? Date.parse(s.ended_at) : Date.parse(s.started_at!);
    return a + Math.min(10, Math.max(0, (end - Date.parse(s.started_at!)) / 60_000));
  }, 0);
  const graded = started.filter((s) => s.debrief_status === "done").length;
  // Each document read is two calls (facts and full text); each debrief is two grading runs; each answer
  // gets one careful transcript. Case-question generation isn't counted (one call per confirmed profile).
  const flashCalls = (reads?.length ?? 0) * 2 + graded * 2 + (answers?.length ?? 0);
  const speechCalls = (speech ?? []).filter((e) => (e.props as { generated?: boolean })?.generated).length;

  const live = minutes * rate.liveMinute;
  const flash = flashCalls * rate.flashCall;
  const tts = speechCalls * rate.speech;
  const total = live + flash + tts;
  const revenueUsd = (passes ?? []).reduce((a, p) => a + p.amount_pesewas, 0) / 100 / env.fxGhsPerUsd;
  const netRevenueUsd = revenueUsd * (5 / 6) * (1 - 0.0195); // less VAT (20% of net) and Paystack's 1.95%
  const applicants = new Set(started.map((s) => s.case_id)).size;
  const full = started.filter((s) => s.mode !== "drill");
  const drills = started.filter((s) => s.mode === "drill");
  const perSession = (list: typeof started) => {
    if (!list.length) return 0;
    const m = list.reduce((a, s) => a + Math.min(10, Math.max(0, ((s.ended_at ? Date.parse(s.ended_at) : Date.parse(s.started_at!)) - Date.parse(s.started_at!)) / 60_000)), 0);
    // Live minutes plus two grading runs and about four careful transcripts per session.
    return (m * rate.liveMinute + list.length * 6 * rate.flashCall) / list.length;
  };

  return (
    <>
      <PageHead title="Costs">
        Estimated Gemini spend in the {label}, from usage at the rates below, against sales. It&rsquo;s an estimate: set COST_USD_LIVE_MINUTE,
        COST_USD_FLASH_CALL and COST_USD_SPEECH from the Google Cloud billing report to make it match.
      </PageHead>
      <RangeTabs path="/admin/costs" range={range} />
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Estimated spend" value={usd(total)} sub={`≈ ${ghs(Math.round(total * env.fxGhsPerUsd * 100))}`} />
        <Stat label="Sales after VAT and fees" value={usd(netRevenueUsd)} sub={`${ghs(Math.round(revenueUsd * env.fxGhsPerUsd * 100))} gross`} />
        <Stat label="Spend per interview" value={usd(perSession(full))} sub={`${full.length} interviews · drills ${usd(perSession(drills))} each`} />
        <Stat label="Spend per active applicant" value={applicants ? usd(total / applicants) : "–"} sub={`${applicants} practised`} />
      </div>
      <Section title="Where it goes">
        <Table
          head={["What", "Usage", "Rate", "Estimated"]}
          rows={[
            ["Live interviews (Gemini Live)", `${minutes.toFixed(0)} min`, `${usd(rate.liveMinute)}/min`, usd(live)],
            ["Reading, grading, transcripts (Flash)", `${flashCalls} calls`, `${usd(rate.flashCall)}/call`, usd(flash)],
            ["Stronger answers read aloud (TTS)", `${speechCalls} clips`, `${usd(rate.speech)}/clip`, usd(tts)],
          ]}
        />
        <p className="mt-2 text-xs text-muted">
          Margin in this range: {netRevenueUsd ? `${Math.round(((netRevenueUsd - total) / netRevenueUsd) * 100)}%` : "–"} of net sales. Free mocks and drills count
          as spend with no sale.
        </p>
      </Section>
    </>
  );
}
