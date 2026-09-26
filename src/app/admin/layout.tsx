import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { daysAgo, minutesAgo, requireAdmin } from "@/lib/server/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin · Okwan" }, robots: { index: false, follow: false } };

const nav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/funnel", label: "Funnel" },
  { href: "/admin/usage", label: "Usage" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/costs", label: "Costs" },
  { href: "/admin/quality", label: "Session quality" },
  { href: "/admin/issues", label: "Issues" },
  { href: "/admin/outcomes", label: "Real outcomes" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/health", label: "Health" },
];

/**
 * Problems worth a look, shown on every admin page. Cheap counts only; the
 * Issues page has the detail. (Email or WhatsApp alerts need a sending service.)
 */
async function alerts(db: Awaited<ReturnType<typeof requireAdmin>>["db"]) {
  const day = daysAgo(1);
  const [debriefs, reads, stuck, unstarted] = await Promise.all([
    db.from("sessions").select("id", { count: "exact", head: true }).eq("debrief_status", "failed").gte("started_at", day),
    db.from("documents").select("id", { count: "exact", head: true }).eq("extraction_status", "failed").gte("created_at", day),
    db
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .is("ended_at", null)
      .lt("started_at", minutesAgo(15))
      .gte("started_at", day),
    db.from("sessions").select("id", { count: "exact", head: true }).is("started_at", null).lt("created_at", daysAgo(2)),
  ]);
  return [
    debriefs.count ? `${debriefs.count} debrief${debriefs.count === 1 ? "" : "s"} failed today` : "",
    reads.count ? `${reads.count} document read${reads.count === 1 ? "" : "s"} failed today` : "",
    stuck.count ? `${stuck.count} session${stuck.count === 1 ? "" : "s"} stuck open` : "",
    unstarted.count ? "the daily cleanup isn't running" : "",
  ].filter(Boolean);
}

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { admin, db } = await requireAdmin();
  const problems = await alerts(db);
  return (
    <div className="min-h-screen">
      <header className="border-b border-ink">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-8">
          <Link href="/admin" className="flex items-center gap-3">
            <Logo />
            <span className="rounded-[3px] border border-stamp px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] text-stamp">Admin</span>
          </Link>
          <span className="hidden text-sm text-muted sm:inline">{admin.email}</span>
        </div>
        <nav aria-label="Admin" className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-3 text-sm sm:px-8">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-[3px] px-3 py-1.5 text-muted hover:bg-ink hover:text-on-ink">
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      {problems.length > 0 && (
        <div role="status" className="border-b border-refused/40 bg-refused/10">
          <p className="mx-auto max-w-7xl px-4 py-2 text-sm sm:px-8">
            Needs a look: {problems.join(" · ")}.{" "}
            <Link href="/admin/issues?days=7" className="font-semibold underline underline-offset-2">
              Issues
            </Link>
          </p>
        </div>
      )}
      <main id="main" className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
        {children}
      </main>
    </div>
  );
}
