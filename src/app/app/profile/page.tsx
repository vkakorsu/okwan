import { keepAllNotes, setNoteStatus } from "@/app/app/actions";
import { ProfileForm } from "@/components/app/profile-form";
import { BackLink, Button, Card, PageTitle } from "@/components/app/ui";
import { documentLabel, isOnScreen } from "@/lib/domain/notes";
import type { DraftConflict } from "@/lib/domain/draft";
import { requireCase } from "@/lib/server/case-access";
import { latestProfile } from "@/lib/server/repo";

export default async function ProfilePage() {
  const { supabase, id, caseRow } = await requireCase("/app/profile");
  const current = await latestProfile(supabase, id);
  const { _conflicts, _fx, ...draft } = caseRow.draft_profile as {
    _conflicts?: DraftConflict[];
    _fx?: { amount: number; currency: string; usd: number; rate: number };
  } & Record<string, unknown>;
  const { data: notes } = await supabase
    .from("case_notes")
    .select("id, source_kind, category, text, quote, status")
    .eq("case_id", id)
    .order("created_at");
  const pending = (notes ?? []).filter((n) => n.status === "pending").length;
  const fundsHint = _fx
    ? `Your statement shows ${_fx.currency} ${_fx.amount.toLocaleString()} ≈ $${_fx.usd.toLocaleString()} at ${_fx.rate} ${_fx.currency} per dollar (approximate). Enter the dollar figure you'll state; it should match your DS-160 and I-20.`
    : undefined;
  const values = (current?.profile as unknown as Record<string, unknown>) ?? draft;

  return (
    <>
      <BackLink href={`/app`}>{caseRow.applicant_name}</BackLink>
      <PageTitle eyebrow="Your facts" title="Confirm what's true">
        {current
          ? "These are your confirmed facts. Changing them creates a new version; your next officer uses the latest."
          : "We pre-filled what we could read from your documents. Correct anything that's wrong. The officer will only use what you confirm."}
      </PageTitle>
      {!!_conflicts?.length && (
        <Card className="mb-6 border-stamp">
          <h2 className="font-display text-2xl uppercase">Your documents disagree</h2>
          <p className="mt-1 text-sm text-muted">Officers notice this. Make sure the true value matches your DS-160.</p>
          <ul className="mt-3 space-y-1 text-sm">
            {_conflicts.map((c, i) => (
              <li key={i}>
                <span className="font-mono text-xs">{c.path}</span>: {JSON.stringify(c.existing)} vs {JSON.stringify(c.incoming)}{" "}
                <span className="text-muted">(from {c.source.replaceAll("_", " ")})</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {!!notes?.length && (
        <Card className="mb-6">
          <div id="notes" className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-2xl uppercase">From your documents</h2>
            {pending > 0 && (
              <form action={keepAllNotes.bind(null, id)}>
                <Button variant="ghost">Keep all {pending}</Button>
              </form>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            Details only you have. Keep the ones that are true: the officer may ask about them, and your coaching uses them.
            Notes from your DS-160, I-20 or passport are on the officer&rsquo;s screen; the rest stay in your folder until the officer asks
            to see that document.
          </p>
          <ul className="mt-4 divide-y divide-line">
            {notes.map((n) => (
              <li key={n.id} className={`flex flex-wrap items-start justify-between gap-3 py-3 text-sm ${n.status === "removed" ? "opacity-50" : ""}`}>
                <span className="min-w-0 flex-1">
                  <span className={n.status === "removed" ? "line-through" : ""}>{n.text}</span>
                  <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
                    {documentLabel(n.source_kind)} · {isOnScreen(n.source_kind) ? "on screen" : "in your folder"}
                    {n.status === "confirmed" ? " · kept" : n.status === "removed" ? " · removed" : ""}
                  </span>
                  {n.quote && <span className="mt-1 block text-xs italic text-muted">&ldquo;{n.quote}&rdquo;</span>}
                </span>
                <span className="flex shrink-0 gap-2">
                  {n.status !== "confirmed" && (
                    <form action={setNoteStatus.bind(null, n.id, "confirmed")}>
                      <Button variant="ghost">{n.status === "removed" ? "Restore" : "Keep"}</Button>
                    </form>
                  )}
                  {n.status !== "removed" && (
                    <form action={setNoteStatus.bind(null, n.id, "removed")}>
                      <Button variant="ghost">{n.status === "confirmed" ? "Remove" : "Not true"}</Button>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card>
        <ProfileForm caseId={id} visaType={caseRow.visa_type} values={values} fundsHint={fundsHint} applicantName={caseRow.applicant_name} />
      </Card>
    </>
  );
}
