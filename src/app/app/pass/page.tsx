import { buyPlan } from "@/app/app/actions";
import { BackLink, Button, Card, PageTitle } from "@/components/app/ui";
import type { PackId } from "@/lib/domain/credits";
import { features } from "@/lib/env";
import { formatGhs, plans, PURCHASABLE } from "@/lib/pricing";
import { requireCase } from "@/lib/server/case-access";
import { caseCredits } from "@/lib/server/repo";

export const metadata = { title: "Get interviews" };

export default async function PassPage(props: PageProps<"/app/pass">) {
  const { reason } = await props.searchParams;
  const { supabase, id, caseRow } = await requireCase("/app/pass");
  const credits = await caseCredits(supabase, id);
  const packs = plans.filter((p) => PURCHASABLE.includes(p.id as PackId));

  return (
    <>
      <BackLink href={`/app`}>{caseRow.applicant_name}</BackLink>
      <PageTitle eyebrow="Interviews and drills" title="Pay for what you use">
        {typeof reason === "string" ? `${reason} ` : ""}
        One payment, no subscription. Every started interview or drill uses one credit; clicking and leaving costs nothing.
        MoMo or card, VAT included. Refundable within 7 days if you&rsquo;ve used at most one interview.
      </PageTitle>
      <p className="mb-2 text-sm">
        For <strong>{caseRow.applicant_name}</strong> ({caseRow.visa_type === "F1" ? "F-1 student" : "B1/B2 visitor"}). Credits stay
        on this account; someone else practising needs their own.
      </p>
      <p className="mb-6 text-sm">
        You have <strong>{credits.interviews}</strong> interview{credits.interviews === 1 ? "" : "s"} and{" "}
        <strong>{credits.drills}</strong> drill{credits.drills === 1 ? "" : "s"} left
        {credits.expiresAt ? `, the first of them to use by ${credits.expiresAt.toDateString()}` : ""}.
      </p>
      {!features.paystack && (
        <p className="mb-6 rounded-[4px] border border-line p-4 text-sm text-muted">Payments aren&rsquo;t configured yet (PAYSTACK_SECRET_KEY).</p>
      )}
      <div className="grid gap-5 md:grid-cols-3">
        {packs.map((p) => (
          <Card key={p.id} className={p.featured ? "border-2 border-ink" : ""}>
            <p className="text-sm text-muted">
              {p.name}
              {p.featured && <span className="label ml-2 text-stamp">Recommended</span>}
            </p>
            <p className="font-display mt-2 text-5xl tabular">{formatGhs(p.priceGhs)}</p>
            <p className="mt-3 text-sm">{p.summary}</p>
            <ul className="mt-3 space-y-1 text-sm text-muted">
              {p.features.map((f) => (
                <li key={f}>✓ {f}</li>
              ))}
            </ul>
            <form action={buyPlan.bind(null, id, p.id as PackId)} className="mt-5">
              <Button disabled={!features.paystack}>Pay with MoMo or card</Button>
            </form>
          </Card>
        ))}
      </div>
    </>
  );
}
