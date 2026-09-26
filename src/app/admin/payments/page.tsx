import Link from "next/link";
import { PageHead, Section, Stat, Table } from "@/components/admin/stat";
import { daysAgo, ghs, requireAdmin } from "@/lib/server/admin";
import { formatDateTime, packLabel } from "@/lib/labels";

export const metadata = { title: "Payments" };

export default async function AdminPayments() {
  const { db } = await requireAdmin();
  const { data } = await db
    .from("passes")
    .select("id, plan, amount_pesewas, paystack_reference, purchased_at, refunded_at, interviews, drills, cases(user_id, applicant_name)")
    .order("purchased_at", { ascending: false })
    .limit(500);
  const passes = data ?? [];
  const paid = passes.filter((p) => p.amount_pesewas > 0);
  const net = paid.filter((p) => !p.refunded_at).reduce((s, p) => s + p.amount_pesewas, 0);
  const refundedAmt = paid.filter((p) => p.refunded_at).reduce((s, p) => s + p.amount_pesewas, 0);
  // VAT is 20% of the net price, so it's 1/6 of a VAT-inclusive amount; Paystack takes 1.95% of the gross.
  const vat = Math.round(net / 6);
  const fees = Math.round(net * 0.0195);
  const week = paid.filter((p) => p.purchased_at >= daysAgo(7)).length;

  return (
    <>
      <PageHead title="Payments">The last 500 packs. Amounts are VAT-inclusive. Paystack fees and VAT are estimated (1.95%, 20%).</PageHead>
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Net sales" value={ghs(net)} sub={`${paid.length} paid · ${week} this week`} />
        <Stat label="VAT owed (est.)" value={ghs(vat)} sub="to GRA" />
        <Stat label="Paystack fees (est.)" value={ghs(fees)} />
        <Stat label="Refunded" value={ghs(refundedAmt)} sub={`${paid.filter((p) => p.refunded_at).length} refunds`} />
      </div>
      <Section title="Packs">
        <Table
          head={["When", "Applicant", "Pack", "Amount", "Reference", "Interviews/drills", "Status"]}
          rows={passes.map((p) => {
            const c = p.cases as unknown as { user_id: string; applicant_name: string } | null;
            return [
              formatDateTime(p.purchased_at),
              c ? (
                <Link key="u" href={`/admin/users/${c.user_id}`} className="underline underline-offset-4">
                  {c.applicant_name}
                </Link>
              ) : (
                "—"
              ),
              packLabel(p.plan),
              p.amount_pesewas ? ghs(p.amount_pesewas) : "Comped",
              <span key="r" className="font-mono text-xs">{p.paystack_reference}</span>,
              `${p.interviews}/${p.drills}`,
              p.refunded_at ? "Refunded" : "Active",
            ];
          })}
          sortValues={passes.map((p) => {
            const c = p.cases as unknown as { applicant_name: string } | null;
            return [p.purchased_at, c?.applicant_name ?? null, packLabel(p.plan), p.amount_pesewas ?? 0, null, p.interviews, p.refunded_at ? "Refunded" : "Active"];
          })}
          empty="No packs yet."
        />
      </Section>
    </>
  );
}
