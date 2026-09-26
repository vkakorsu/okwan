import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/auth";
import { recordPayment, verifyTransaction } from "@/lib/server/paystack";
import { createServiceClient } from "@/lib/supabase/server";

/** Paystack sends the user back here. We verify directly with Paystack (never trust the URL). */
export default async function BillingReturn(props: PageProps<"/app/billing/return">) {
  const { reference } = await props.searchParams;
  await requireUser();
  if (typeof reference !== "string") redirect("/app");
  let caseId: string | undefined;
  let ok = false;
  try {
    const tx = await verifyTransaction(reference);
    const meta = typeof tx.metadata === "string" ? JSON.parse(tx.metadata) : tx.metadata;
    caseId = meta?.case_id;
    const result = await recordPayment(createServiceClient(), tx);
    ok = result === "recorded" || result === "duplicate";
  } catch (e) {
    console.error("billing return", e);
  }
  redirect(caseId ? `/app?notice=${ok ? "paid" : "payment-pending"}` : "/app");
}
