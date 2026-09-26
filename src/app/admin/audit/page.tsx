import Link from "next/link";
import { PageHead, Table } from "@/components/admin/stat";
import { requireAdmin } from "@/lib/server/admin";
import { formatDateTime } from "@/lib/labels";

const AUDIT_ACTIONS: Record<string, string> = {
  view_case_facts: "Viewed case facts",
  refund_pass: "Refunded a pack",
  grant_pass: "Granted a pack",
  set_role: "Changed role",
};

export const metadata = { title: "Audit log" };

export default async function AdminAudit() {
  const { db } = await requireAdmin();
  const { data, error } = await db.from("admin_audit_log").select("*").order("created_at", { ascending: false }).limit(500);
  return (
    <>
      <PageHead title="Audit log">Every sensitive admin action, with the reason given. Entries can&rsquo;t be edited from the app.</PageHead>
      {error && (
        <p className="mt-6 rounded-[4px] border border-refused/40 p-4 text-sm">
          The audit log table is missing. Apply <code className="font-mono">supabase/migrations/20260926000005_admin.sql</code>. Sensitive
          actions are blocked until then.
        </p>
      )}
      <div className="mt-8">
        <Table
          head={["When", "Admin", "Action", "Target", "Reason"]}
          rows={(data ?? []).map((r) => [
            formatDateTime(r.created_at),
            <Link key="a" href={`/admin/users/${r.admin_id}`} className="font-mono text-xs underline underline-offset-4">
              {String(r.admin_id).slice(0, 8)}
            </Link>,
            AUDIT_ACTIONS[r.action] ?? r.action,
            <span key="t" className="font-mono text-xs">{r.target_id ? String(r.target_id).slice(0, 8) : "—"}</span>,
            r.reason,
          ])}
          sortValues={(data ?? []).map((r) => [r.created_at, String(r.admin_id), AUDIT_ACTIONS[r.action] ?? r.action, r.target_id ? String(r.target_id) : null, r.reason])}
          empty="No admin actions yet."
        />
      </div>
    </>
  );
}
