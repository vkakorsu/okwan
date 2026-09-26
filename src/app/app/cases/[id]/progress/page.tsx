import Link from "next/link";
import { notFound } from "next/navigation";
import { ReadinessChart } from "@/components/app/readiness-chart";
import { BackLink, Card, PageTitle } from "@/components/app/ui";
import type { AnswerQuality } from "@/lib/domain/director";
import { progress } from "@/lib/domain/progress";
import { LEVEL_LABELS, readiness, readinessTopics, type TopicStatus } from "@/lib/domain/readiness";
import { formatDate, modeLabel, topicLabel } from "@/lib/labels";
import { requireUser } from "@/lib/server/auth";
import { getCase, latestProfile, pastSessions } from "@/lib/server/repo";

export const metadata = { title: "Progress" };

/** Each answer as a symbol and a colour, so it never relies on colour alone. */
const CELL: Record<AnswerQuality, { glyph: string; cls: string; label: string }> = {
  strong: { glyph: "✓", cls: "bg-approved text-on-ink", label: "Strong" },
  adequate: { glyph: "~", cls: "bg-fg/10 text-fg", label: "Adequate" },
  weak: { glyph: "✗", cls: "bg-refused/15 text-refused", label: "Weak" },
  contradiction: { glyph: "!", cls: "bg-refused text-on-ink", label: "Contradicted the file" },
};
const STATUS: Record<TopicStatus, string> = { solid: "Solid", improving: "Improving", weak: "Weak last time", untested: "Not asked yet" };

export default async function ProgressPage(props: PageProps<"/app/cases/[id]/progress">) {
  const { id } = await props.params;
  const { supabase } = await requireUser(`/app/cases/${id}/progress`);
  const caseRow = await getCase(supabase, id);
  if (!caseRow) notFound();
  const [current, history] = await Promise.all([latestProfile(supabase, id), pastSessions(supabase, id)]);
  const topics = current ? readinessTopics(current.profile) : [];
  const now = readiness(history, topics);
  const p = progress(history, topics);
  const first = p.points[0];

  return (
    <>
      <BackLink href={`/app/cases/${id}`}>{caseRow.applicant_name}</BackLink>
      <PageTitle eyebrow="Progress" title="How your readiness has moved">
        Readiness after each session, and how every topic went, session by session. It measures preparation, not your chance of approval.
      </PageTitle>

      <div className="grid items-start gap-6">
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-2xl uppercase">Readiness</h2>
            <p className="text-sm">
              <span className="font-semibold tabular">{Math.round(now.score * 100)}%</span> · {LEVEL_LABELS[now.level]}
              {first && p.points.length > 1 && (
                <span className="text-muted">
                  {" "}
                  · from {Math.round(first.score * 100)}% on {formatDate(first.at)}
                </span>
              )}
            </p>
          </div>
          {now.caps[0] && <p className="mt-1 text-sm text-muted">{now.caps[0].reason}</p>}
          <div className="mt-4">
            <ReadinessChart points={p.points} />
          </div>
        </Card>

        <Card>
          <h2 className="font-display text-2xl uppercase">Topic by topic</h2>
          <p className="mt-1 text-sm text-muted">Your last {p.columns.length || "few"} sessions, oldest on the left. Key topics first.</p>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Key">
            {(Object.keys(CELL) as AnswerQuality[]).map((q) => (
              <li key={q} className="flex items-center gap-1.5">
                <span className={`inline-flex h-4 w-4 items-center justify-center rounded-[2px] text-[10px] font-bold ${CELL[q].cls}`}>{CELL[q].glyph}</span>
                {CELL[q].label}
              </li>
            ))}
            <li className="flex items-center gap-1.5">
              <span className="inline-flex h-4 w-4 rounded-[2px] border border-line" />
              Not asked
            </li>
          </ul>
          {!p.columns.length ? (
            <p className="mt-4 text-sm text-muted">Nothing yet. Topics fill in as officers ask them.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[32rem] border-separate border-spacing-[2px] text-left text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="label pb-2 font-normal text-muted">Topic</th>
                    {p.columns.map((c) => (
                      <th key={c.sessionId} scope="col" className="w-6 pb-2 text-center font-normal">
                        <Link
                          href={`/app/sessions/${c.sessionId}/debrief`}
                          title={`${formatDate(c.at)} · ${modeLabel(c.mode)} · ${c.officer}`}
                          className="text-[10px] text-muted hover:text-fg"
                        >
                          {new Date(c.at).getUTCDate()}
                        </Link>
                      </th>
                    ))}
                    <th scope="col" className="label pb-2 pl-3 font-normal text-muted">Now</th>
                  </tr>
                </thead>
                <tbody>
                  {p.topics.map((t) => (
                    <tr key={t.id}>
                      <th scope="row" className="pr-3 font-normal">
                        {topicLabel(t.id)}
                        {t.critical && <span className="ml-1 text-xs text-muted">(key)</span>}
                      </th>
                      {t.cells.map((q, i) => (
                        <td key={p.columns[i].sessionId} className="text-center">
                          {q ? (
                            <span
                              title={`${CELL[q].label} · ${formatDate(p.columns[i].at)} · ${p.columns[i].officer}`}
                              className={`inline-flex h-5 w-5 items-center justify-center rounded-[2px] text-[11px] font-bold ${CELL[q].cls}`}
                            >
                              {CELL[q].glyph}
                              <span className="sr-only">{CELL[q].label}</span>
                            </span>
                          ) : (
                            <span className="inline-flex h-5 w-5 rounded-[2px] border border-line" aria-label="Not asked" />
                          )}
                        </td>
                      ))}
                      <td className="whitespace-nowrap pl-3 text-xs text-muted">{STATUS[t.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
