import Link from "next/link";
import { PageHead, Table } from "@/components/admin/stat";
import { inputCls } from "@/components/app/ui";
import { requireAdmin } from "@/lib/server/admin";
import { capitalize, formatDate } from "@/lib/labels";

export const metadata = { title: "Users" };

export default async function AdminUsers(props: PageProps<"/admin/users">) {
  const { db } = await requireAdmin();
  const { q } = await props.searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  let req = db.from("profiles").select("id, email, role, created_at").order("created_at", { ascending: false }).limit(50);
  if (query) {
    if (/^[0-9a-f-]{36}$/i.test(query)) req = req.eq("id", query);
    else req = req.ilike("email", `%${query.toLowerCase()}%`);
  }
  const { data: users, error } = await req;
  const ids = (users ?? []).map((u) => u.id);
  const { data: caseRows } = ids.length ? await db.from("cases").select("user_id").in("user_id", ids) : { data: [] };
  const caseCount = new Map<string, number>();
  for (const c of caseRows ?? []) caseCount.set(c.user_id, (caseCount.get(c.user_id) ?? 0) + 1);

  return (
    <>
      <PageHead title="Users">Search by email or user ID. Case facts and recordings are hidden; opening them is audit-logged.</PageHead>
      <form className="mt-6 flex max-w-lg gap-2">
        <input name="q" defaultValue={query} placeholder="email or user ID" className={inputCls} />
        <button className="rounded-[3px] bg-ink px-5 text-sm font-semibold text-on-ink hover:bg-stamp">Search</button>
      </form>
      {error && <p role="alert" className="mt-6 text-sm text-refused">Couldn&rsquo;t load users: {error.message}</p>}
      <div className="mt-6">
        <Table
          head={["Email", "Role", "Cases", "Joined", ""]}
          rows={(users ?? []).map((u) => [
            u.email ?? "—",
            capitalize(u.role),
            caseCount.get(u.id) ?? 0,
            formatDate(u.created_at),
            <Link key="l" href={`/admin/users/${u.id}`} className="underline underline-offset-4">
              Open
            </Link>,
          ])}
          sortValues={(users ?? []).map((u) => [u.email ?? null, u.role, caseCount.get(u.id) ?? 0, u.created_at, null])}
          empty={query ? "No match." : "No users yet."}
        />
      </div>
    </>
  );
}
