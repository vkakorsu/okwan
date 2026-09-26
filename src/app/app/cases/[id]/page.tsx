import Link from "next/link";
import { notFound } from "next/navigation";
import { reportOutcome, setInterviewDate, setPacked, startDrill, startSession } from "@/app/app/actions";
import { Button, Card, Field, inputCls, Notice } from "@/components/app/ui";
import { daysUntil } from "@/lib/countdown";
import { CaseHeader } from "@/components/app/case-header";
import { NextStepCard } from "@/components/app/next-step-card";
import { nextStep } from "@/lib/next-step";
import { PackingList } from "@/components/app/packing-list";
import { MODE_INFO } from "@/lib/modes";
import { scanCase } from "@/lib/domain/case-scan";
import { whatToBring } from "@/lib/domain/checklist";
import { fillTemplate, isFillable, probesFor } from "@/lib/domain/probes";
import { requireUser } from "@/lib/server/auth";
import { caseDrillEntitlement, caseEntitlement, getCase, latestProfile, pastSessions } from "@/lib/server/repo";
import { readiness, readinessTopics } from "@/lib/domain/readiness";
import { openStoryChanges } from "@/lib/domain/director";
import { StoryChanges } from "@/components/app/story-changes";
import { DailyPlanCard } from "@/components/app/daily-plan-card";
import { dailyPlan } from "@/lib/domain/daily-plan";
import { formatDate, modeLabel } from "@/lib/labels";

const OUTCOME: Record<string, { label: string; cls: string }> = {
  approved: { label: "Approved", cls: "bg-approved/10 text-approved" },
  refused_214b: { label: "214(b) refusal", cls: "bg-refused/10 text-refused" },
  administrative_221g: { label: "221(g)", cls: "bg-stamp/10 text-accent" },
  incomplete: { label: "Ended early", cls: "bg-fg/5 text-muted" },
};

const SEVERITY: Record<string, string> = {
  high: "bg-refused/10 text-refused",
  medium: "bg-stamp/10 text-accent",
  low: "bg-fg/5 text-muted",
};

const hasPassed = (d: Date) => d.getTime() < Date.now();

export default async function CasePage(props: PageProps<"/app/cases/[id]">) {
  const { id } = await props.params;
  const { notice } = await props.searchParams;
  const { supabase } = await requireUser(`/app/cases/${id}`);
  const caseRow = await getCase(supabase, id);
  if (!caseRow) notFound();

  const [current, history, ent, drillEnt, { data: sessions }, { data: docs }, { count: pendingNotes }, { data: outcome }] = await Promise.all([
    latestProfile(supabase, id),
    pastSessions(supabase, id),
    caseEntitlement(supabase, caseRow),
    caseDrillEntitlement(supabase, caseRow),
    // Sessions that never started (a mode clicked, then left) aren't shown or counted.
    supabase
      .from("sessions")
      .select("id, mode, outcome, is_free, created_at, started_at, ended_at, plan")
      .eq("case_id", id)
      .not("started_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("documents").select("kind, extraction_status").eq("case_id", id),
    supabase.from("case_notes").select("id", { count: "exact", head: true }).eq("case_id", id).eq("status", "pending"),
    supabase.from("outcomes").select("result").eq("case_id", id).maybeSingle(),
  ]);

  const flags = current ? scanCase(current.profile) : [];
  const topics = current ? readinessTopics(current.profile) : [];
  const ready = readiness(history, topics);
  // Topics to drill, most valuable first (src/lib/domain/readiness.ts): weak answers, then
  // practised topics that aren't solid yet. Untested ones come up in interviews.
  const toFix = current
    ? ready.next
        .map((id) => ready.topics.find((t) => t.id === id)!)
        .filter((t) => t.status === "weak" || t.status === "improving")
        .slice(0, 4)
        .map((t) => {
          const probe = probesFor(caseRow.visa_type).find((p) => p.id === t.id)!;
          return {
            id: t.id,
            status: t.status,
            question: fillTemplate(probe.entry.find((e) => isFillable(e, current.profile)) ?? probe.entry[0], current.profile),
          };
        })
    : [];
  const interview = caseRow.interview_at ? new Date(caseRow.interview_at) : null;
  const daysToGo = caseRow.interview_at ? daysUntil(caseRow.interview_at) : null;
  const subtitle = current?.profile.study?.school ?? current?.profile.visit?.purpose ?? null;
  const bring = current ? whatToBring(current.profile) : [];
  const packed = new Set(caseRow.checklist_packed ?? []);
  const weak = toFix.find((t) => t.status === "weak");
  const step = nextStep({
    caseId: id,
    documents: (docs ?? []).map((d) => ({ status: d.extraction_status as "pending" | "done" | "failed" })),
    factsConfirmed: Boolean(current),
    pendingNotes: pendingNotes ?? 0,
    sessions: (sessions ?? []).map((x) => ({ mode: x.mode, ended: Boolean(x.ended_at) })),
    canInterview: ent.kind,
    interviewNote: ent.kind === "none" ? ent.reason : undefined,
    canDrill: drillEnt.kind,
    weakest: weak ? { probeId: weak.id, question: weak.question } : null,
    daysToInterview: daysToGo,
    requiredStillToPack: bring.filter((b) => b.group === "Required" && !packed.has(b.id)).length,
    outcomeReported: Boolean(outcome),
  });
  const interviewPassed = interview ? hasPassed(interview) : false;
  const plan = dailyPlan({
    daysToInterview: daysToGo,
    readiness: ready.score,
    sessions: (sessions ?? []).map((x) => ({ mode: x.mode as string, at: (x.started_at ?? x.created_at) as string })),
    hasWeakTopic: ready.topics.some((t) => t.status === "weak"),
    hasStoryChange: openStoryChanges(history).length > 0,
    outcomeReported: Boolean(outcome),
  });

  return (
    <>
      <Notice code={notice} />
      <CaseHeader
        caseId={id}
        visaLabel={caseRow.visa_type === "F1" ? "F-1 student" : "B1/B2 visitor"}
        subtitle={subtitle}
        name={caseRow.applicant_name}
        factsVersion={current?.version ?? null}
        docCount={docs?.length ?? 0}
        readiness={ready}
        interviewAt={caseRow.interview_at}
        days={daysToGo}
        setDate={setInterviewDate.bind(null, id)}
      />
      <NextStepCard caseId={id} step={step} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="practice" className="scroll-mt-24 font-display text-2xl uppercase">Practice</h2>
              <span className="label text-muted">{ent.reason}</span>
            </div>
            {!current ? (
              <p className="mt-6 text-sm">
                First, <Link className="underline" href={`/app/cases/${id}/profile`}>confirm your facts</Link>. The officer only uses what you confirm.
              </p>
            ) : ent.kind === "none" ? (
              <>
                <ul className="mt-6 divide-y divide-line border-y border-line">
                  {(["real", "practice", "dress_rehearsal", "drill"] as const).map((m) => (
                    <li key={m} className="py-3">
                      <span className="font-semibold">{MODE_INFO[m].name}</span>
                      <span className="label ml-2 text-muted">{MODE_INFO[m].length}</span>
                      <span className="mt-1 block text-sm text-muted">{MODE_INFO[m].body}</span>
                    </li>
                  ))}
                </ul>
                <Link href={`/app/cases/${id}/pass`} className="mt-6 inline-block rounded-[3px] bg-ink px-5 py-2.5 text-sm font-semibold text-on-ink hover:bg-stamp">
                  Get interviews
                </Link>
              </>
            ) : (
              <ul className="mt-6 divide-y divide-line border-y border-line">
                {(ent.kind === "free" ? (["free"] as const) : (["real", "practice", "dress_rehearsal"] as const)).map((m, i) => {
                  const info = MODE_INFO[m];
                  return (
                    <li key={m} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4">
                      <span className="min-w-0 flex-1 basis-64">
                        <span className="font-semibold">{info.name}</span>
                        <span className="label ml-2 text-muted">{info.length}</span>
                        <span className="mt-1 block text-sm text-muted">{info.body}</span>
                      </span>
                      <form action={startSession.bind(null, id, m === "free" ? "real" : m)}>
                        <Button variant={i === 0 ? "primary" : "ghost"}>{m === "free" ? "Start free mock" : "Start"}</Button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="font-display text-2xl uppercase">Sessions</h2>
            {(sessions ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-muted">No sessions yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {(sessions ?? []).map((s) => {
                  const o = s.outcome ? OUTCOME[s.outcome] : null;
                  const officer = (s.plan as { officer?: { name?: string } })?.officer?.name;
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                      <span>
                        <span className="font-medium">{officer}</span>{" "}
                        <span className="text-muted">
                          · {modeLabel(s.mode, s.is_free)} · {formatDate(s.created_at)}
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        {o && <span className={`rounded-[3px] px-2 py-0.5 text-xs ${o.cls}`}>{o.label}</span>}
                        {s.ended_at ? (
                          <Link className="underline-offset-4 hover:underline" href={`/app/sessions/${s.id}/debrief`}>
                            Debrief
                          </Link>
                        ) : (
                          <span className="text-muted">Unfinished</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {current && <StoryChanges caseId={id} visaType={caseRow.visa_type} changes={openStoryChanges(history)} />}

          {toFix.length > 0 && (
            <Card>
              <h2 id="fix" className="scroll-mt-24 font-display text-2xl uppercase">Answers to fix</h2>
              <p className="mt-1 text-sm text-muted">Drills: one question, a new officer each time, graded straight away. Repeat until it&rsquo;s solid.</p>
              <ul className="mt-4 divide-y divide-line">
                {toFix.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <span className="min-w-0 flex-1">
                      &ldquo;{t.question}&rdquo;
                      <span
                        className={`ml-2 inline-block rounded-[3px] px-2 py-0.5 text-xs font-semibold ${t.status === "weak" ? "bg-refused/10 text-refused" : "bg-fg/5 text-muted"}`}
                      >
                        {t.status === "weak" ? "Weak last time" : "Improving"}
                      </span>
                    </span>
                    <form action={startDrill.bind(null, id, t.id)}>
                      <Button variant="ghost">Drill ▸</Button>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {flags.length > 0 && (
            <Card>
              <h2 className="font-display text-2xl uppercase">Case Scan</h2>
              <p className="mt-1 text-sm text-muted">Where the officer is likely to press. No approval odds, ever.</p>
              <ul className="mt-4 space-y-3">
                {flags.map((f) => (
                  <li key={f.id} className="flex items-start gap-3 rounded-[4px] border border-line p-4">
                    <span className={`mt-0.5 rounded-[3px] px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ${SEVERITY[f.severity]}`}>{f.severity}</span>
                    <span>
                      <span className="block font-medium">{f.title}</span>
                      <span className="mt-1 block text-sm text-muted">{f.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {current && <DailyPlanCard caseId={id} plan={plan} hasDate={Boolean(caseRow.interview_at)} />}
          {current && (
            <Card>
              <h2 className="font-display text-2xl uppercase">Guides</h2>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Link className="underline underline-offset-2" href={`/app/cases/${id}/facts`}>Know your file</Link>
                  <span className="text-muted">: the facts and numbers on the officer&rsquo;s screen, with a quick quiz</span>
                </li>
                <li>
                  <Link className="underline underline-offset-2" href={`/app/cases/${id}/progress`}>Progress</Link>
                  <span className="text-muted">: your readiness over time, topic by topic</span>
                </li>
                <li>
                  <Link className="underline underline-offset-2" href={`/app/cases/${id}/social`}>Social media check</Link>
                  <span className="text-muted">
                    {caseRow.visa_type === "F1" ? ": required public profiles, checked against your application" : ": do your profiles match your application?"}
                  </span>
                </li>
                <li>
                  <Link className="underline underline-offset-2" href={`/app/cases/${id}/day`}>Interview day</Link>
                  <span className="text-muted">: the embassy from the night before to the decision</span>
                </li>
                {(current.profile.history.priorRefusals.length > 0 || outcome?.result === "refused_214b" || outcome?.result === "refused_other") && (
                  <li>
                    <Link className="underline underline-offset-2" href={`/app/cases/${id}/refused`}>Refused before</Link>
                    <span className="text-muted">: reapply now or wait, and what counts as a real change</span>
                  </li>
                )}
              </ul>
            </Card>
          )}
          {current && (
            <Card>
              <h2 id="bring" className="scroll-mt-24 font-display text-2xl uppercase">
                What to bring
              </h2>
              <p className="mt-1 text-sm text-muted">Built from your confirmed facts. Tick each original as it goes into your folder.</p>
              <PackingList
                items={bring}
                uploaded={(docs ?? []).map((d) => d.kind as string)}
                packed={caseRow.checklist_packed ?? []}
                setPacked={setPacked.bind(null, id)}
              />
            </Card>
          )}

          {interviewPassed && (
            <Card>
              <h2 id="outcome" className="scroll-mt-24 font-display text-2xl uppercase">
                How did it go?
              </h2>
              <form action={reportOutcome.bind(null, id)} className="mt-4 grid gap-3">
                <Field label="Result">
                  <select name="result" className={inputCls}>
                    <option value="approved">Approved</option>
                    <option value="administrative_221g">221(g)</option>
                    <option value="refused_214b">Refused, 214(b)</option>
                    <option value="refused_other">Refused, other</option>
                  </select>
                </Field>
                <Field label="Questions you were asked" hint="Comma-separated. Helps the next applicant.">
                  <input name="questions" className={inputCls} />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="consent" /> Use my questions anonymously to improve Okwan
                </label>
                <Button>Send</Button>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
