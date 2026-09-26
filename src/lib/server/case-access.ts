import "server-only";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/auth";
import { accountCaseId, getCase } from "@/lib/server/repo";

/**
 * One account is one applicant, so pages under /app find the case from the
 * signed-in user instead of carrying its id in the URL. Without a case yet,
 * they send the user to set one up.
 */
export async function requireCase(next = "/app") {
  const { user, supabase } = await requireUser(next);
  const id = await accountCaseId(supabase, user.id);
  const caseRow = id ? await getCase(supabase, id) : null;
  if (!id || !caseRow) redirect("/app");
  return { user, supabase, id, caseRow };
}
