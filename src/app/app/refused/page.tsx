import Link from "next/link";
import { startDrill, startSession } from "@/app/app/actions";
import { ReapplyCheck } from "@/components/app/reapply-check";
import { BackLink, Button, Card, PageTitle } from "@/components/app/ui";
import { requireCase } from "@/lib/server/case-access";
import { latestProfile } from "@/lib/server/repo";

export const metadata = { title: "Refused before" };

/**
 * For applicants refused before: what a 214(b) or 221(g) means, whether to
 * reapply now or wait, and practice on "What has changed?". Honest by design:
 * sometimes the answer is to wait.
 */
export default async function RefusedPage() {
  const { supabase, id, caseRow } = await requireCase("/app/refused");
  const [current, { data: outcome }] = await Promise.all([
    latestProfile(supabase, id),
    supabase.from("outcomes").select("result").eq("case_id", id).maybeSingle(),
  ]);
  const refusals = current?.profile.history.priorRefusals ?? [];
  const last = refusals.length ? Math.max(...refusals.map((r) => r.year)) : null;
  const reportedRefusal = outcome?.result === "refused_214b" || outcome?.result === "refused_other";
  const onFile = refusals.length > 0;

  return (
    <>
      <BackLink href={`/app`}>{caseRow.applicant_name}</BackLink>
      <PageTitle eyebrow="Refused before" title="What a refusal means, and what to do next">
        {onFile
          ? `Your file shows ${refusals.length === 1 ? `a refusal in ${last}` : `${refusals.length} refusals, most recently ${last}`}. The officer can see ${refusals.length === 1 ? "it" : "them"}, and the notes from the last interview.`
          : reportedRefusal
            ? "You told us your interview ended in a refusal. We're sorry. Here's how to think about what comes next."
            : "If you've been refused before, add it to your facts: the officer can see every refusal."}
      </PageTitle>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <h2 className="font-display text-2xl uppercase">Should you reapply now?</h2>
            <p className="mt-1 text-sm text-muted">Tick what has really changed since the refusal. Be strict with yourself: the officer will be.</p>
            <div className="mt-4">
              <ReapplyCheck visaType={caseRow.visa_type} />
            </div>
          </Card>

          <Card>
            <h2 className="font-display text-2xl uppercase">What a 214(b) refusal means</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
              <li>
                The officer wasn&rsquo;t convinced you&rsquo;ll return after your {caseRow.visa_type === "F1" ? "studies" : "visit"}. The law
                presumes every applicant intends to stay; the burden is on you to show otherwise.
              </li>
              <li>It isn&rsquo;t a ban. There&rsquo;s no waiting period, and you can reapply whenever you like, with a new DS-160 and fee.</li>
              <li>
                The next officer sees the refusal and the notes. Their first question is usually some version of{" "}
                <span className="font-voice">&ldquo;What has changed since last time?&rdquo;</span>
              </li>
              <li>
                A better speech isn&rsquo;t a change. New facts are: stronger documented funding, a job, promotion or business, new family
                ties, real progress in your studies or work.
              </li>
              <li>Never change facts to fit. If your new DS-160 contradicts the old one, the officer will notice, and misrepresentation can bar you permanently.</li>
            </ul>
          </Card>

          <Card>
            <h2 className="font-display text-2xl uppercase">If you got a 221(g) instead</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
              <li>It isn&rsquo;t a refusal yet. The officer needs something more before deciding: a document, or checks that take time (&ldquo;administrative processing&rdquo;).</li>
              <li>Follow the sheet you were given exactly: what to send, how and by when. Keep copies and the case number.</li>
              <li>Administrative processing can take weeks or longer. Check your status on the State Department&rsquo;s status site; don&rsquo;t book travel until you have the visa.</li>
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="font-display text-2xl uppercase">Practise &ldquo;What&rsquo;s changed?&rdquo;</h2>
            <p className="mt-1 text-sm text-muted">
              One sentence, first: what changed, then the evidence. Not the story of the last interview.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {onFile ? (
                <form action={startDrill.bind(null, id, "common.history.refusal")}>
                  <Button>Drill it ▸</Button>
                </form>
              ) : (
                <Link href={`/app/profile`} className="rounded-[3px] bg-ink px-4 py-2 text-sm font-semibold text-on-ink hover:bg-stamp">
                  Add the refusal to your facts
                </Link>
              )}
              {current && (
                <form action={startSession.bind(null, id, "real")}>
                  <Button variant="ghost">Full interview</Button>
                </form>
              )}
            </div>
          </Card>
          <p className="text-xs text-muted">
            General information, not legal advice. For questions about past misrepresentation, overstays or waivers, speak to a US
            immigration attorney.
          </p>
        </div>
      </div>
    </>
  );
}
