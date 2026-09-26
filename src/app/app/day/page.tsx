import { track } from "@/lib/server/events";
import { after } from "next/server";
import Link from "next/link";
import { PrintButton } from "@/components/app/print-button";
import { BackLink, Card, PageTitle } from "@/components/app/ui";
import { countdownLabel, daysUntil } from "@/lib/countdown";
import { formatDate } from "@/lib/labels";
import { requireCase } from "@/lib/server/case-access";

export const metadata = { title: "Interview day" };

/**
 * The day at the US Embassy in Accra. Where the exact choreography isn't
 * confirmed (docs/INTERVIEW-REALISM.md §10, open questions), the guide says to
 * check the embassy's current instructions instead of guessing.
 */
const EMBASSY_VISAS = "https://gh.usembassy.gov/visas/";

function Step({ when, title, children }: { when: string; title: string; children: React.ReactNode }) {
  return (
    <li className="grid gap-1 py-4 sm:grid-cols-[9rem_1fr] sm:gap-6">
      <span className="label text-muted">{when}</span>
      <div>
        <p className="font-semibold">{title}</p>
        <div className="mt-1 space-y-1 text-sm">{children}</div>
      </div>
    </li>
  );
}

export default async function DayPage() {
  const { user, caseRow } = await requireCase("/app/day");
  after(() => track(user.id, "day_viewed"));
  const student = caseRow.visa_type === "F1";
  const days = caseRow.interview_at ? daysUntil(caseRow.interview_at) : null;

  return (
    <>
      <div className="print:hidden">
        <BackLink href={`/app`}>{caseRow.applicant_name}</BackLink>
      </div>
      <PageTitle eyebrow="Interview day" title="The day at the embassy">
        {caseRow.interview_at
          ? `${formatDate(caseRow.interview_at)} · ${countdownLabel(days!)}. `
          : ""}
        What to expect at the US Embassy in Accra, from the night before to what happens after. Rules at the gate change: check the{" "}
        <a className="underline" href={EMBASSY_VISAS} target="_blank" rel="noreferrer">
          embassy&rsquo;s visa pages
        </a>{" "}
        and your appointment letter for the current instructions.
      </PageTitle>
      <div className="mb-6 print:hidden">
        <PrintButton />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <ol className="divide-y divide-line">
            <Step when="The night before" title="Pack one folder, then stop practising">
              <p>
                Go through <Link className="underline" href={`/app#bring`}>What to bring</Link>: passport, DS-160 confirmation page,
                appointment letter{student ? ", signed I-20 and SEVIS fee receipt" : ""}, and your supporting documents in the order you&rsquo;d
                reach for them.
              </p>
              <p>
                Read <Link className="underline" href={`/app/facts`}>Know your file</Link> once. No new answers now: you know your case.
              </p>
              <p>Plan your route and leave time for Accra traffic. Sleep.</p>
            </Step>
            <Step when="The morning" title="Dress simply, travel light">
              <p>Dress as you would for a job interview. Eat something.</p>
              <p>
                Bring as little as possible. Many US embassies don&rsquo;t allow phones, bags or electronics inside: check the current list on
                your appointment letter or the embassy site, and arrange where to leave anything you can&rsquo;t take in.
              </p>
            </Step>
            <Step when="Arriving" title="The consular entrance">
              <p>The Consular Section entrance is on Fifth Link Road, Cantonments. Arrive around your appointment time; you won&rsquo;t be let in much earlier.</p>
              <p>Expect a queue and airport-style security, then a document check and fingerprints. Keep your passport and papers in your hand.</p>
            </Step>
            <Step when="Waiting" title="Stay calm, and stay quiet">
              <p>You may wait a while. Don&rsquo;t cram notes or rehearse aloud: officers can tell a recited answer.</p>
              <p>Listen to the interviews around you if you like, but remember every case is different.</p>
            </Step>
            <Step when="At the window" title="Two to five minutes, through glass">
              <p>Greet the officer and pass your passport{student ? " and I-20" : ""} when asked. The officer speaks through a microphone; speak up and clearly.</p>
              <p>Answer the question in your first sentence, in your own words. Short and true beats long and polished.</p>
              <p>If you didn&rsquo;t catch it, say &ldquo;Sorry, could you repeat that?&rdquo; It&rsquo;s normal.</p>
              <p>Hand over a document only when asked. Never guess a number: if you&rsquo;re unsure, say so.</p>
            </Step>
            <Step when="The decision" title="Usually told on the spot">
              <p>
                <span className="font-semibold">Approved:</span> the officer keeps your passport and gives you a slip explaining how to collect it
                (in Accra, from DHL). Don&rsquo;t book travel until the visa is in your hands.
              </p>
              <p>
                <span className="font-semibold">221(g):</span> a sheet listing what else is needed. Follow it exactly, and keep the case number.
              </p>
              <p>
                <span className="font-semibold">Refused under 214(b):</span> a letter explaining the section. It isn&rsquo;t a ban.{" "}
                <Link className="underline" href={`/app/refused`}>What to do next</Link>.
              </p>
            </Step>
          </ol>
        </Card>

        <div className="space-y-6 print:hidden">
          <Card>
            <h2 className="font-display text-2xl uppercase">In your head at the window</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
              <li>First sentence answers the question.</li>
              <li>Same true facts as your DS-160, every time.</li>
              <li>Numbers you know: cost, funds, sponsor, dates.</li>
              <li>One reason to come back, said plainly.</li>
              <li>Breathe before you answer. A second of silence is fine.</li>
            </ul>
          </Card>
          <Card>
            <h2 className="font-display text-2xl uppercase">Afterwards</h2>
            <p className="mt-1 text-sm text-muted">Whatever happens, tell us how it went. It makes the practice more real for the next applicant.</p>
            <Link href={`/app#outcome`} className="mt-3 inline-block text-sm underline">
              Report your outcome
            </Link>
          </Card>
        </div>
      </div>
    </>
  );
}
