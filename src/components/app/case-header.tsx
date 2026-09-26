import Link from "next/link";
import { Countdown } from "@/components/app/countdown";
import { Guilloche } from "@/components/guilloche";
import { LEVEL_LABELS, type Readiness } from "@/lib/domain/readiness";

/** The top of a case: who and what it's for, readiness, and the interview countdown. */
export function CaseHeader({
  caseId,
  visaLabel,
  subtitle,
  name,
  factsVersion,
  docCount,
  readiness,
  interviewAt,
  days,
  setDate,
}: {
  caseId: string;
  visaLabel: string;
  subtitle: string | null;
  name: string;
  factsVersion: number | null;
  docCount: number;
  readiness: Readiness;
  interviewAt: string | null;
  days: number | null;
  setDate: (formData: FormData) => Promise<void>;
}) {
  return (
    <section className="doc relative mb-8 overflow-hidden">
      <Guilloche className="guilloche pointer-events-none absolute -right-40 -top-40 w-[460px]" />
      <div className="relative grid divide-y divide-line md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] md:divide-x md:divide-y-0">
        <div className="min-w-0 p-6 sm:p-8">
          <p className="label text-muted">
            {visaLabel}
            {subtitle ? ` · ${subtitle}` : ""}
          </p>
          <h1 className="font-display mt-2 text-[clamp(2rem,4.4vw,3.4rem)] uppercase leading-[0.95]">{name}</h1>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
            <Link href={`/app/cases/${caseId}/profile`} className="rounded-[3px] border border-ink px-3 py-1.5 font-semibold hover:bg-ink hover:text-on-ink">
              {factsVersion ? "Your facts" : "Confirm your facts"}
            </Link>
            <Link href={`/app/cases/${caseId}/documents`} className="rounded-[3px] border border-ink px-3 py-1.5 font-semibold hover:bg-ink hover:text-on-ink">
              Documents <span className="font-normal text-muted">· {docCount}</span>
            </Link>
            {factsVersion && (
              <Link href={`/app/cases/${caseId}/facts`} className="rounded-[3px] border border-ink px-3 py-1.5 font-semibold hover:bg-ink hover:text-on-ink">
                Know your file
              </Link>
            )}
            <span className="text-muted">{factsVersion ? `Facts confirmed (version ${factsVersion})` : "Not confirmed yet"}</span>
          </div>
        </div>
        <div className="p-6 sm:p-8">
          <p className="label text-muted">Readiness</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <span className="font-display text-5xl tabular">{Math.round(readiness.score * 100)}%</span>
            <span className="text-sm font-semibold">{LEVEL_LABELS[readiness.level]}</span>
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-fg/10">
            <div className="h-full rounded-full bg-stamp" style={{ width: `${Math.round(readiness.score * 100)}%` }} />
          </div>
          <p
            className="mt-2 text-xs leading-relaxed text-muted"
            title="How prepared you are, not your chance of approval. Each topic counts by how likely it is to come up and whether it decides the case. Recent answers count most, tougher officers and full interviews count more than drills, and answers fade after a few weeks. A topic is solid once two officers, one of them tough, heard it answered well."
          >
            {!readiness.total
              ? "Confirm your facts to see the topics you'll be tested on."
              : readiness.caps[0] && Math.round(readiness.score * 100) >= Math.round(readiness.caps[0].max * 100)
                ? readiness.caps[0].reason
                : `${readiness.confirmed} of ${readiness.total} topics solid · ${readiness.answeredWell} answered well`}
          </p>
          <p className="mt-1 text-[11px] text-muted">
            How prepared you are, not a chance of approval.{" "}
            <Link href={`/app/cases/${caseId}/progress`} className="underline underline-offset-2">
              See progress
            </Link>
          </p>
        </div>
        <div id="countdown" className="p-6 sm:p-8">
          <Countdown interviewAt={interviewAt} days={days} setDate={setDate} />
        </div>
      </div>
    </section>
  );
}
