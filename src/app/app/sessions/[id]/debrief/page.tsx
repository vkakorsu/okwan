import Link from "next/link";
import { notFound } from "next/navigation";
import { correctTranscript, rateSession, retryDebrief, startDrill, startSession } from "@/app/app/actions";
import { AnswerAudioProvider, PlayAnswer } from "@/components/app/answer-audio";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { HearAnswer } from "@/components/app/hear-answer";
import { ShareDebrief } from "@/components/app/share-debrief";
import { env } from "@/lib/env";
import { BackLink, Button, Card, PageTitle } from "@/components/app/ui";
import { deliveryNotes, type DeliveryMetrics, type VoiceSummary } from "@/lib/domain/delivery";
import { NOTE_PROBE_PREFIX, type SessionPlan } from "@/lib/domain/director";
import { documentLabel } from "@/lib/domain/notes";
import { requireUser } from "@/lib/server/auth";
import { caseDrillEntitlement, caseEntitlement, getCase, pastSessions } from "@/lib/server/repo";
import { CLAIM_LABELS, storyChanges } from "@/lib/domain/story";
import { stripToolText } from "@/lib/domain/transcript";
import { formatDate, TESTING_LABELS } from "@/lib/labels";

const OUTCOME = {
  approved: { title: "Approved", line: "The officer approved you in this simulation.", cls: "text-approved" },
  refused_214b: { title: "Refused under 214(b)", line: "The officer wasn't convinced in this simulation.", cls: "text-refused" },
  administrative_221g: { title: "221(g)", line: "The officer needed more information.", cls: "text-accent" },
  incomplete: { title: "No decision", line: "You left before the officer finished.", cls: "text-muted" },
} as const;

interface TurnScores {
  llm?: { directness: number; specificity: number; consistency: number; conciseness: number };
  testing?: string;
  delivery?: DeliveryMetrics;
  voice?: VoiceSummary | null;
  probe_id?: string | null;
  stronger_answer?: string | null;
  missing_evidence?: string | null;
  rewrite_blocked_terms?: string[];
}

function Score({ label, v }: { label: string; v?: number }) {
  return (
    <div className="text-center">
      <p className="font-display text-2xl uppercase tabular">{v ?? "–"}</p>
      <p className="text-[11px] uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}

// Correcting a transcript re-grades in the background (after()).
export const maxDuration = 300;

export default async function DebriefPage(props: PageProps<"/app/sessions/[id]/debrief">) {
  const { id } = await props.params;
  const { notice } = await props.searchParams;
  const { supabase } = await requireUser(`/app/sessions/${id}/debrief`);
  const { data: s } = await supabase
    .from("sessions")
    .select("id, case_id, plan, outcome, decision_reasons, debrief, debrief_status, realism_rating, started_at, ended_at, recording_path, referee_state")
    .eq("id", id)
    .maybeSingle();
  if (!s) notFound();
  const { data: turns } = await supabase
    .from("turns")
    .select("seq, officer_text, user_transcript_raw, user_transcript_corrected, user_transcript_asr, started_ms, ended_ms, scores, red_flags")
    .eq("session_id", id)
    .order("seq");
  const plan = s.plan as SessionPlan;
  // The closing decision line isn't a question: hide unanswered turns after the last answer.
  // Best transcript first: the user's correction, then the careful one from the recording, then the live one.
  const answeredText = (t: { user_transcript_raw: string | null; user_transcript_corrected: string | null; user_transcript_asr: string | null }) =>
    (t.user_transcript_corrected ?? t.user_transcript_asr ?? t.user_transcript_raw ?? "").trim();
  const lastAnswered = (turns ?? []).map((t) => Boolean(answeredText(t))).lastIndexOf(true);
  // Hide the closing decision line, and a passport handed over without a word.
  const shown = (turns ?? [])
    .slice(0, lastAnswered + 1)
    .filter((t) => !(t.seq === 1 && !String(t.officer_text).includes("?") && !answeredText(t)));
  const o = s.outcome ? OUTCOME[s.outcome as keyof typeof OUTCOME] : null;
  const debrief = s.debrief as { summary?: string; top_fixes?: string[]; first_minute_seqs?: number[] } | null;
  const grading = s.debrief_status === "pending" || s.debrief_status === "running";
  // This session's live share links (RLS: the owner's own).
  const { data: shares } = await supabase
    .from("debrief_shares")
    .select("token, expires_at")
    .eq("session_id", id)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  // Facts this session stated differently from an earlier one (src/lib/domain/story.ts).
  const history = await pastSessions(supabase, s.case_id as string);
  const changedHere = storyChanges(
    history
      .filter((h): h is typeof h & { id: string; at: string } => Boolean(h.id && h.at))
      .reverse()
      .map((h) => ({ id: h.id, at: h.at, claims: h.claims ?? [] })),
  ).filter((c) => c.after.sessionId === id);
  const drill = plan.mode === "drill";
  // Topics the officer planned but never reached (a fast decision, or time ran out): drill them instead.
  const reached = new Set(((s.referee_state as { turns?: { probeId: string }[] } | null)?.turns ?? []).map((t) => t.probeId));
  const unreached = drill
    ? []
    : plan.probes
        .filter((p) => !reached.has(p.probeId))
        .map((p) => {
          const note = p.probeId.startsWith(NOTE_PROBE_PREFIX)
            ? plan.notes?.find((n) => `${NOTE_PROBE_PREFIX}${n.id}` === p.probeId)
            : undefined;
          return { id: p.probeId, label: note ? `A question about your ${documentLabel(note.source)}` : `“${p.entry}”` };
        });
  const planned = new Set(plan.probes.map((p) => p.probeId));
  // Playback needs the WAV recording, whose time 0 matches the turn timings.
  let audioSrc: string | null = null;
  if (s.recording_path?.endsWith(".wav")) {
    const { data: signed } = await supabase.storage.from("recordings").createSignedUrl(s.recording_path, 3600);
    audioSrc = signed?.signedUrl ?? null;
  }
  const seconds = s.started_at && s.ended_at ? Math.round((+new Date(s.ended_at) - +new Date(s.started_at)) / 1000) : null;

  // What to do next depends on what this person can still use.
  const caseRow = await getCase(supabase, s.case_id);
  const [ent, drillEnt] = caseRow
    ? await Promise.all([caseEntitlement(supabase, caseRow), caseDrillEntitlement(supabase, caseRow)])
    : [null, null];
  const avg = (sc: TurnScores) => (sc.llm ? (sc.llm.directness + sc.llm.specificity + sc.llm.consistency + sc.llm.conciseness) / 4 : 99);
  const weakest = shown
    .map((t) => ({ t, sc: (t.scores ?? {}) as TurnScores }))
    .filter(({ sc }) => sc.llm && sc.probe_id && planned.has(sc.probe_id))
    .sort((a, b) => avg(a.sc) - avg(b.sc))[0];

  return (
    <>
      {grading && <AutoRefresh />}
      <BackLink href={`/app/cases/${s.case_id}`}>Back to your prep page</BackLink>
      {notice === "regrade-limit" && (
        <p role="status" className="mb-6 text-sm text-refused">You&rsquo;ve reached the re-grade limit for this session.</p>
      )}
      <PageTitle
        eyebrow={`${drill ? "Drill" : "Debrief"} · ${plan.officer.name}${seconds ? ` · ${Math.floor(seconds / 60)}m ${seconds % 60}s` : ""}`}
        title={drill ? "One question, again" : (o?.title ?? "Session ended")}
      >
        {drill ? "No verdict in a drill: fix the answer, then do it again with a new officer." : `${o?.line ?? ""} This is a training signal, not a prediction.`}
      </PageTitle>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        <div className="space-y-6">
          {drill ? (
            <form action={startDrill.bind(null, s.case_id, plan.probes[0].probeId)}>
              <button className="w-full rounded-[3px] bg-ink px-5 py-3 text-sm font-semibold text-on-ink hover:bg-stamp">
                Drill it again, new officer ▸
              </button>
            </form>
          ) : (
            <Card>
              <h2 className="font-display text-2xl uppercase">Why</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {(s.decision_reasons ?? []).map((r: string) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <h2 className="font-display text-2xl uppercase">Fix these first</h2>
            {grading ? (
              <p className="mt-2 text-sm text-muted">Reviewing your answers…</p>
            ) : s.debrief_status === "failed" ? (
              <>
                <p className="mt-2 text-sm text-muted">We couldn&rsquo;t grade this session. Your transcript is below.</p>
                <form action={retryDebrief.bind(null, id)} className="mt-3">
                  <Button variant="ghost">Try grading again</Button>
                </form>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-muted">{debrief?.summary}</p>
                <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
                  {(debrief?.top_fixes ?? []).map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ol>
                {changedHere.length > 0 && (
                  <div className="mt-5 rounded-[4px] border border-refused p-4 text-sm">
                    <p className="font-semibold text-refused">Your story changed</p>
                    <ul className="mt-2 space-y-1">
                      {changedHere.map((c) => (
                        <li key={c.key}>
                          {CLAIM_LABELS[c.key][0].toUpperCase() + CLAIM_LABELS[c.key].slice(1)}: before you said &ldquo;{c.before.value}&rdquo;
                          ({formatDate(c.before.at)}), today &ldquo;{c.after.value}&rdquo;.
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-muted">A real officer would take a shifting answer as a sign something isn&rsquo;t true. Settle on the true answer and give it every time.</p>
                  </div>
                )}
              </>
            )}
          </Card>
          {s.debrief_status === "done" && (
            <Card className="print:hidden">
              <h2 className="font-display text-2xl uppercase">Share this debrief</h2>
              <div className="mt-2">
                <ShareDebrief sessionId={id} siteUrl={env.siteUrl} active={shares ?? []} />
              </div>
            </Card>
          )}
          {unreached.length > 0 && !grading && (
            <Card>
              <h2 className="font-display text-2xl uppercase">Not reached</h2>
              <p className="mt-1 text-sm text-muted">
                {s.outcome === "refused_214b" || s.outcome === "administrative_221g"
                  ? "The officer decided before getting to these. Real officers often do. Practise them one at a time."
                  : "The officer didn't get to these. Practise them one at a time."}
              </p>
              <ul className="mt-3 divide-y divide-line">
                {unreached.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0">{u.label}</span>
                    <form action={startDrill.bind(null, s.case_id, u.id)}>
                      <button className="shrink-0 rounded-[3px] border border-ink px-3 py-1.5 text-xs font-semibold hover:bg-ink hover:text-on-ink">
                        Drill ▸
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <h2 className="font-display text-2xl uppercase">Did this feel real?</h2>
            <div className="mt-3 flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <form key={n} action={rateSession.bind(null, id, n)}>
                  <button
                    aria-label={`${n} out of 5`}
                    className={`size-10 rounded-[3px] border text-sm ${s.realism_rating === n ? "border-ink bg-ink text-on-ink" : "border-line hover:border-fg/40"}`}
                  >
                    {n}
                  </button>
                </form>
              ))}
            </div>
          </Card>
          {!grading && !drill && (
            <Card className="border-2 border-ink">
              <p className="label text-stamp">What next</p>
              {weakest && drillEnt && drillEnt.kind !== "none" ? (
                <>
                  <h2 className="font-display mt-1 text-2xl uppercase">Fix your weakest answer</h2>
                  <p className="mt-1 text-sm text-muted">&ldquo;{stripToolText(weakest.t.officer_text)}&rdquo; One question, a new officer, graded straight away.</p>
                  <form action={startDrill.bind(null, s.case_id, weakest.sc.probe_id!)} className="mt-4">
                    <Button>{drillEnt.kind === "free" ? "Free drill →" : "Drill it →"}</Button>
                  </form>
                </>
              ) : ent?.kind === "full" ? (
                <>
                  <h2 className="font-display mt-1 text-2xl uppercase">Face the next officer</h2>
                  <p className="mt-1 text-sm text-muted">A different officer, different questions. {ent.reason}.</p>
                  <form action={startSession.bind(null, s.case_id, "real")} className="mt-4">
                    <Button>Start interview →</Button>
                  </form>
                </>
              ) : (
                <>
                  <h2 className="font-display mt-1 text-2xl uppercase">Keep practising</h2>
                  <p className="mt-1 text-sm text-muted">You&rsquo;ve seen what to fix. A pack gives you more interviews and drills with new officers.</p>
                  <Link href={`/app/cases/${s.case_id}/pass`} className="mt-4 inline-block rounded-[3px] bg-ink px-5 py-2.5 text-sm font-semibold text-on-ink hover:bg-stamp">
                    Get interviews →
                  </Link>
                </>
              )}
              <Link href={`/app/cases/${s.case_id}`} className="mt-4 block text-sm underline underline-offset-4">
                Back to your case
              </Link>
            </Card>
          )}
        </div>

        <Answers src={audioSrc}>
        <div className="space-y-4">
          {shown.length === 0 && <Card><p className="text-sm text-muted">No answers were recorded.</p></Card>}
          {shown.map((t) => {
            const sc = (t.scores ?? {}) as TurnScores;
            const answer = answeredText(t);
            const notes = sc.delivery ? deliveryNotes(sc.delivery, sc.voice) : [];
            // Drill the topic the officer was testing (only topics from this plan can be drilled).
            const drillProbe = sc.probe_id && planned.has(sc.probe_id) ? sc.probe_id : drill ? plan.probes[0].probeId : null;
            const firstMinute = debrief?.first_minute_seqs?.includes(t.seq);
            return (
              <Card key={t.seq}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                  <span>
                    {sc.testing ? `Testing: ${TESTING_LABELS[sc.testing] ?? sc.testing}` : `Question ${t.seq}`}
                    {firstMinute ? " · first minute" : ""}
                  </span>
                  {sc.delivery && (
                    <span className={sc.delivery.tooLong ? "text-refused" : ""}>
                      {sc.delivery.seconds}s · {sc.delivery.words} words · {sc.delivery.fillers} fillers
                    </span>
                  )}
                </div>
                <p className="font-display mt-3 text-xl">&ldquo;{t.officer_text}&rdquo;</p>
                <p className="mt-3 text-sm leading-relaxed text-muted">{answer || <em>(no answer)</em>}</p>
                {(audioSrc && t.started_ms != null && t.ended_ms != null && t.ended_ms > t.started_ms) || drillProbe ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {audioSrc && t.started_ms != null && t.ended_ms != null && t.ended_ms > t.started_ms && (
                      <PlayAnswer id={t.seq} startMs={t.started_ms} endMs={t.ended_ms} />
                    )}
                    {drillProbe && !drill && (
                      <form action={startDrill.bind(null, s.case_id, drillProbe)}>
                        <button className="rounded-[3px] border border-ink px-3 py-1.5 text-xs font-semibold hover:bg-ink hover:text-on-ink">
                          Practise this one ▸
                        </button>
                      </form>
                    )}
                  </div>
                ) : null}
                {!!notes.length && (
                  <ul className="mt-3 space-y-1 text-xs text-muted">
                    {notes.map((n) => (
                      <li key={n}>· {n}</li>
                    ))}
                  </ul>
                )}
                {sc.llm && (
                  <div className="mt-4 grid grid-cols-4 gap-2 rounded-[4px] border border-line py-3">
                    <Score label="Direct" v={sc.llm.directness} />
                    <Score label="Specific" v={sc.llm.specificity} />
                    <Score label="Consistent" v={sc.llm.consistency} />
                    <Score label="Concise" v={sc.llm.conciseness} />
                  </div>
                )}
                {!!t.red_flags?.length && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {t.red_flags.map((f: string) => (
                      <li key={f} className="rounded-[3px] bg-refused/10 px-2.5 py-1 text-xs text-refused">{f}</li>
                    ))}
                  </ul>
                )}
                {sc.stronger_answer && (
                  <div className="mt-4 rounded-[4px] border border-approved/30 bg-approved/5 p-4">
                    <p className="text-xs text-muted">Your answer, stronger (only your facts)</p>
                    <p className="mt-1 text-sm leading-relaxed">{sc.stronger_answer}</p>
                    <HearAnswer sessionId={id} seq={t.seq} />
                    <p className="mt-2 text-xs text-muted">Listen for the pace and the first sentence, then say it in your own words. Don&rsquo;t memorise it.</p>
                  </div>
                )}
                {sc.missing_evidence && <p className="mt-3 text-sm text-muted">Evidence gap: {sc.missing_evidence}</p>}
                {answer && (
                  <details className="mt-4 border-t border-line pt-3">
                    <summary className="label cursor-pointer text-muted">Did we mishear you? Correct it</summary>
                    <form action={correctTranscript.bind(null, id, t.seq)} className="mt-3 grid gap-2">
                      <textarea name="answer" defaultValue={answer} rows={3} maxLength={4000} className="w-full rounded-[3px] border border-ink bg-card p-3 text-sm" />
                      <button className="w-fit rounded-[3px] border border-ink px-4 py-2 text-sm font-semibold hover:bg-ink hover:text-on-ink">
                        Save and re-grade
                      </button>
                    </form>
                  </details>
                )}
              </Card>
            );
          })}
        </div>
        </Answers>
      </div>
    </>
  );
}

function Answers({ src, children }: { src: string | null; children: React.ReactNode }) {
  return src ? <AnswerAudioProvider src={src}>{children}</AnswerAudioProvider> : <>{children}</>;
}
