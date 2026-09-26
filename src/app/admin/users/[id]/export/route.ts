import { features } from "@/lib/env";
import { recentlyAudited } from "@/lib/server/admin";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Everything held about one user, as JSON (Ghana DPA access request). Only
 * for an admin who logged a reason in the last 10 minutes (exportUser).
 * Stored files are listed with links that work for 24 hours.
 */
export async function GET(_req: Request, ctx: RouteContext<"/admin/users/[id]/export">) {
  if (!features.supabaseAdmin) return new Response("Not found", { status: 404 });
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Not found", { status: 404 });
  const db = createServiceClient();
  const { data: me } = await db.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (me?.role !== "admin") return new Response("Not found", { status: 404 });
  if (!(await recentlyAudited(db, auth.user.id, "export_user", id))) {
    return new Response("Log a reason on the user page first (valid for 10 minutes).", { status: 403 });
  }

  const [{ data: profile }, { data: authUser }, { data: cases }, { data: events }, { data: shares }] = await Promise.all([
    db.from("profiles").select("*").eq("id", id).maybeSingle(),
    db.auth.admin.getUserById(id),
    db.from("cases").select("*").eq("user_id", id),
    db.from("events").select("name, props, at").eq("user_id", id).order("at"),
    db.from("debrief_shares").select("token, session_id, created_at, expires_at, revoked_at").eq("created_by", id),
  ]);
  const caseIds = (cases ?? []).map((c) => c.id as string);
  const inCases = <T,>(q: PromiseLike<{ data: T[] | null }>) => q.then((r) => r.data ?? []);
  const [caseProfiles, notes, documents, passes, outcomes, sessions] = caseIds.length
    ? await Promise.all([
        inCases(db.from("case_profiles").select("*").in("case_id", caseIds).order("version")),
        inCases(db.from("case_notes").select("*").in("case_id", caseIds).order("created_at")),
        inCases(db.from("documents").select("*").in("case_id", caseIds).order("created_at")),
        inCases(db.from("passes").select("*").in("case_id", caseIds)),
        inCases(db.from("outcomes").select("*").in("case_id", caseIds)),
        inCases(
          db
            .from("sessions")
            .select("*, turns(*), probe_results(*)")
            .in("case_id", caseIds)
            .order("created_at"),
        ),
      ])
    : [[], [], [], [], [], []];

  // Stored files, with temporary links.
  const files: { bucket: string; path: string; url: string | null }[] = [];
  for (const bucket of ["documents", "recordings"] as const) {
    const store = db.storage.from(bucket);
    const walk = async (prefix: string) => {
      const { data } = await store.list(prefix, { limit: 1000 });
      for (const f of data ?? []) {
        const path = `${prefix}/${f.name}`;
        if (!f.id) {
          await walk(path);
          continue;
        }
        const { data: signed } = await store.createSignedUrl(path, 24 * 3600);
        files.push({ bucket, path, url: signed?.signedUrl ?? null });
      }
    };
    await walk(id);
  }

  const body = {
    exported_at: new Date().toISOString(),
    note: "Everything Okwan holds about this account. File links expire 24 hours after export.",
    account: {
      id,
      email: authUser.user?.email ?? null,
      created_at: authUser.user?.created_at ?? null,
      email_confirmed_at: authUser.user?.email_confirmed_at ?? null,
      last_sign_in_at: authUser.user?.last_sign_in_at ?? null,
    },
    profile,
    cases,
    case_profiles: caseProfiles,
    case_notes: notes,
    documents,
    passes,
    outcomes,
    sessions,
    debrief_shares: shares ?? [],
    events: events ?? [],
    files,
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="okwan-user-${id.slice(0, 8)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
