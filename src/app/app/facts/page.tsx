import Link from "next/link";
import { Flashcards } from "@/components/app/flashcards";
import { PrintButton } from "@/components/app/print-button";
import { BackLink, Card, PageTitle } from "@/components/app/ui";
import { scanCase } from "@/lib/domain/case-scan";
import { factSheet, flashcards } from "@/lib/domain/fact-sheet";
import { documentLabel, isOnScreen } from "@/lib/domain/notes";
import { requireCase } from "@/lib/server/case-access";
import { latestProfile } from "@/lib/server/repo";

export const metadata = { title: "Know your file" };

export default async function FactsPage() {
  const { supabase, id, caseRow } = await requireCase("/app/facts");
  const current = await latestProfile(supabase, id);
  const { data: notes } = await supabase
    .from("case_notes")
    .select("id, source_kind, text")
    .eq("case_id", id)
    .eq("status", "confirmed")
    .order("created_at");

  if (!current) {
    return (
      <>
        <BackLink href={`/app`}>{caseRow.applicant_name}</BackLink>
        <PageTitle eyebrow="Know your file" title="Confirm your facts first">
          This sheet is built from the facts you confirm.{" "}
          <Link className="underline" href={`/app/profile`}>
            Confirm them now
          </Link>
          .
        </PageTitle>
      </>
    );
  }

  const sections = factSheet(current.profile);
  const cards = flashcards(current.profile);
  const watch = scanCase(current.profile).filter((f) => f.severity === "high");

  return (
    <>
      <div className="print:hidden">
        <BackLink href={`/app`}>{caseRow.applicant_name}</BackLink>
      </div>
      <PageTitle eyebrow="Know your file" title="What the officer has on screen">
        Officers check what you say against your DS-160 and I-20. Know these facts cold, especially the numbers and dates in
        bold. Don&rsquo;t memorise speeches: know the facts, then answer in your own words.
      </PageTitle>
      <div className="mb-6 print:hidden">
        <PrintButton />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {sections.map((s) => (
            <Card key={s.title} className="break-inside-avoid">
              <h2 className="font-display text-2xl uppercase">{s.title}</h2>
              <dl className="mt-3 divide-y divide-line text-sm">
                {s.facts.map((f, i) => (
                  <div key={`${f.label}-${i}`} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-2">
                    <dt className="text-muted">{f.label}</dt>
                    <dd className={`text-right ${f.key ? "font-semibold tabular" : ""}`}>{f.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ))}
          {!!notes?.length && (
            <Card className="break-inside-avoid">
              <h2 className="font-display text-2xl uppercase">From your documents</h2>
              <p className="mt-1 text-sm text-muted">
                Details you kept. Ones marked &ldquo;on screen&rdquo; the officer can see; the rest only if they ask for that document.
              </p>
              <ul className="mt-3 divide-y divide-line text-sm">
                {notes.map((n) => (
                  <li key={n.id} className="py-2">
                    {n.text}
                    <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
                      {documentLabel(n.source_kind)} · {isOnScreen(n.source_kind) ? "on screen" : "in your folder"}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-6 print:hidden">
          <Card>
            <h2 className="font-display text-2xl uppercase">Quick quiz</h2>
            <p className="mt-1 text-sm text-muted">The exact questions officers fire off. Answer out loud, then check your file.</p>
            <div className="mt-4">
              <Flashcards cards={cards} />
            </div>
          </Card>
          {watch.length > 0 && (
            <Card>
              <h2 className="font-display text-2xl uppercase">Where you&rsquo;ll be pressed</h2>
              <ul className="mt-3 space-y-3 text-sm">
                {watch.map((f) => (
                  <li key={f.id}>
                    <span className="font-semibold">{f.title}.</span> <span className="text-muted">{f.detail}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <p className="text-xs text-muted">
            If anything here is wrong, <Link className="underline" href={`/app/profile`}>correct your facts</Link>, and make sure your
            DS-160 says the same thing.
          </p>
        </div>
      </div>
    </>
  );
}
