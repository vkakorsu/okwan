import Link from "next/link";
import { PageHead, Table } from "@/components/admin/stat";
import { inputCls } from "@/components/app/ui";
import { requireAdmin } from "@/lib/server/admin";
import { capitalize, formatDate } from "@/lib/labels";

export const metadata = { title: "Users" };

const PAGE = 50;

export default async function AdminUsers(props: PageProps<"/admin/users">) {
  const { db } = await requireAdmin();
  const { q, page, notice } = await props.searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const pageNo = Math.max(1, Number(typeof page === "string" ? page : 1) || 1);
  let req = db
    .from("profiles")
    .select("id, email, role, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((pageNo - 1) * PAGE, pageNo * PAGE - 1);
  if (query) {
    if (/^[0-9a-f-]{36}$/i.test(query)) req = req.eq("id", query);
    else req = req.ilike("email", `%${query.toLowerCase()}%`);
  }
  const { data: users, error, count } = await req;

  // The applicant behind each account (one per account), their practice and whether they've paid.
  const ids = (users ?? []).map((u) => u.id);
  const { data: cases } = ids.length
    ? await db.from("cases").select("id, user_id, visa_type, interview_at, sessions(started_at), passes(amount_pesewas)").in("user_id", ids)
    : { data: [] };
  const byUser = new Map(
    (cases ?? []).map((c) => {
      const started = ((c.sessions ?? []) as { started_at: string | null }[]).map((s) => s.started_at).filter((s): s is string => Boolean(s)).sort();
      const paid = ((c.passes ?? []) as { amount_pesewas: number }[]).some((p) => p.amount_pesewas > 0);
      return [c.user_id as string, { visa: c.visa_type as string, interview: c.interview_at as string | null, sessions: started.length, last: started.at(-1) ?? null, paid }];
    }),
  );
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const link = (p: number) => `/admin/users?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(p) })}`;

  return (
    <>
      <PageHead title="Users">Search by email or user ID. Facts and sessions are hidden; opening them is audit-logged.</PageHead>
      {notice === "deleted" && (
        <p role="status" className="mt-4 rounded-[4px] border border-stamp bg-stamp/10 px-4 py-3 text-sm">Account and its data deleted. The audit log keeps the record.</p>
      )}
      <form className="mt-6 flex max-w-lg gap-2">
        <input name="q" defaultValue={query} placeholder="email or user ID" className={inputCls} />
        <button className="rounded-[3px] bg-ink px-5 text-sm font-semibold text-on-ink hover:bg-stamp">Search</button>
      </form>
      {error && <p role="alert" className="mt-6 text-sm text-refused">Couldn&rsquo;t load users: {error.message}</p>}
      <div className="mt-6">
        <Table
          head={["Email", "Role", "Visa", "Interview", "Sessions", "Last practised", "Paid", "Joined", ""]}
          rows={(users ?? []).map((u) => {
            const a = byUser.get(u.id);
            return [
              u.email ?? "—",
              capitalize(u.role),
              a ? (a.visa === "F1" ? "F-1" : "B1/B2") : <span key="s" className="text-muted">Not set up</span>,
              a?.interview ? formatDate(a.interview) : "—",
              a?.sessions ?? 0,
              a?.last ? formatDate(a.last) : "—",
              a?.paid ? "Yes" : "",
              formatDate(u.created_at),
              <Link key="l" href={`/admin/users/${u.id}`} className="underline underline-offset-4">
                Open
              </Link>,
            ];
          })}
          sortValues={(users ?? []).map((u) => {
            const a = byUser.get(u.id);
            return [u.email ?? null, u.role, a?.visa ?? null, a?.interview ?? null, a?.sessions ?? 0, a?.last ?? null, a?.paid ? "Yes" : "No", u.created_at, null];
          })}
          csvName={`okwan-users-page-${pageNo}`}
          empty={query ? "No match." : "No users yet."}
        />
      </div>
      {pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center gap-3 text-sm">
          {pageNo > 1 && <Link href={link(pageNo - 1)} className="underline underline-offset-4">← Newer</Link>}
          <span className="text-muted">
            Page {pageNo} of {pages} · {count} users
          </span>
          {pageNo < pages && <Link href={link(pageNo + 1)} className="underline underline-offset-4">Older →</Link>}
        </nav>
      )}
    </>
  );
}
