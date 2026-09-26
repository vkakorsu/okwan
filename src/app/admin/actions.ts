"use server";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { creditExpiry, PACKS } from "@/lib/domain/credits";
import { audit, requireAdmin } from "@/lib/server/admin";
import { runDebrief, runExtraction } from "@/lib/server/jobs";

const Reason = z.string().trim().min(5, "Give a reason (at least 5 characters)").max(500);

/** Viewing someone's case facts is logged first; the page only shows facts backed by a fresh log entry. */
export async function viewCaseFacts(userId: string, caseId: string, formData: FormData) {
  const { admin, db } = await requireAdmin();
  const reason = Reason.parse(formData.get("reason"));
  await audit(db, { adminId: admin.id, action: "view_case_facts", targetId: caseId, reason });
  redirect(`/admin/users/${userId}?facts=${caseId}`);
}

export async function grantPass(userId: string, caseId: string, formData: FormData) {
  const { admin, db } = await requireAdmin();
  const reason = Reason.parse(formData.get("reason"));
  const plan = z.enum(["prep", "full", "topup"]).parse(formData.get("plan"));
  const reference = `comp_${randomUUID().replace(/-/g, "")}`;
  await audit(db, { adminId: admin.id, action: "grant_pass", targetId: caseId, reason, details: { plan, reference } });
  await db.from("passes").insert({
    case_id: caseId,
    plan,
    paystack_reference: reference,
    amount_pesewas: 0,
    interviews: PACKS[plan].interviews,
    drills: PACKS[plan].drills,
    expires_at: creditExpiry(new Date()).toISOString(),
  });
  redirect(`/admin/users/${userId}?notice=granted`);
}

export async function setRole(userId: string, formData: FormData) {
  const { admin, db } = await requireAdmin();
  const reason = Reason.parse(formData.get("reason"));
  const role = z.enum(["applicant", "coach", "senior", "admin"]).parse(formData.get("role"));
  if (userId === admin.id && role !== "admin") redirect(`/admin/users/${userId}?notice=self-demote`);
  await audit(db, { adminId: admin.id, action: "set_role", targetId: userId, reason, details: { role } });
  await db.from("profiles").update({ role }).eq("id", userId);
  redirect(`/admin/users/${userId}?notice=role-updated`);
}

/** Opening a user's session (transcript, answers, grades) is logged first, like case facts. */
export async function viewSession(userId: string, sessionId: string, formData: FormData) {
  const { admin, db } = await requireAdmin();
  const reason = Reason.parse(formData.get("reason"));
  await audit(db, { adminId: admin.id, action: "view_session", targetId: sessionId, reason, details: { user: userId } });
  redirect(`/admin/sessions/${sessionId}`);
}

/** Re-runs a failed debrief or document read. */
export async function retryJob(kind: "debrief" | "extraction", targetId: string, back: string) {
  const { admin, db } = await requireAdmin();
  z.enum(["debrief", "extraction"]).parse(kind);
  await audit(db, { adminId: admin.id, action: "retry_job", targetId, reason: `Retry ${kind} from admin`, details: { kind } });
  if (kind === "debrief") {
    await db.from("sessions").update({ debrief_status: "pending" }).eq("id", targetId);
    after(() => runDebrief(targetId));
  } else {
    await db.from("documents").update({ extraction_status: "pending", extraction_error: null }).eq("id", targetId);
    after(() => runExtraction(targetId));
  }
  redirect(`${back}${back.includes("?") ? "&" : "?"}notice=retrying`);
}

/** A copy of everything held about a user (Ghana DPA access request). Logged; the download link works for 10 minutes. */
export async function exportUser(userId: string, formData: FormData) {
  const { admin, db } = await requireAdmin();
  const reason = Reason.parse(formData.get("reason"));
  await audit(db, { adminId: admin.id, action: "export_user", targetId: userId, reason });
  redirect(`/admin/users/${userId}?notice=export-ready`);
}

/**
 * Deletes an account and everything linked to it (Ghana DPA erasure request).
 * Payment records are kept in the audit entry (reference, amount, plan, date:
 * no personal data) before the rows go. Admins can't be deleted from here.
 */
export async function deleteUser(userId: string, formData: FormData) {
  const { admin, db } = await requireAdmin();
  const reason = Reason.parse(formData.get("reason"));
  const { data: profile } = await db.from("profiles").select("email, role").eq("id", userId).maybeSingle();
  if (!profile) redirect("/admin/users");
  if (userId === admin.id || profile.role === "admin") redirect(`/admin/users/${userId}?notice=cant-delete-admin`);
  if (String(formData.get("confirm") ?? "").trim().toLowerCase() !== String(profile.email ?? "").toLowerCase()) {
    redirect(`/admin/users/${userId}?notice=confirm-mismatch`);
  }
  const { data: cases } = await db.from("cases").select("id").eq("user_id", userId);
  const caseIds = (cases ?? []).map((c) => c.id as string);
  const { data: passes } = caseIds.length
    ? await db.from("passes").select("paystack_reference, amount_pesewas, plan, purchased_at").in("case_id", caseIds)
    : { data: [] };
  await audit(db, { adminId: admin.id, action: "delete_user", targetId: userId, reason, details: { payments: passes ?? [] } });

  // Files first (documents, recordings, spoken answers), then rows, then the login.
  for (const bucket of ["documents", "recordings"] as const) {
    const store = db.storage.from(bucket);
    const paths: string[] = [];
    const walk = async (prefix: string) => {
      const { data } = await store.list(prefix, { limit: 1000 });
      for (const f of data ?? []) {
        const path = `${prefix}/${f.name}`;
        if (f.id) paths.push(path);
        else await walk(path); // a folder
      }
    };
    await walk(userId);
    for (let i = 0; i < paths.length; i += 100) await store.remove(paths.slice(i, i + 100));
  }
  if (caseIds.length) {
    await db.from("passes").delete().in("case_id", caseIds);
    await db.from("cases").delete().in("id", caseIds);
  }
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) throw new Error(`Rows and files were deleted, but the login wasn't: ${error.message}`);
  redirect("/admin/users?notice=deleted");
}
