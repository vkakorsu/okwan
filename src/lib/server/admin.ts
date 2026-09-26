import "server-only";
import { notFound } from "next/navigation";
import { features } from "@/lib/env";
import { requireUser } from "@/lib/server/auth";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Admin gate. Non-admins get a 404 so the area's existence isn't advertised.
 * Returns a service client: admin pages read across all users, so every page
 * must go through this check first.
 */
export async function requireAdmin() {
  if (!features.supabaseAdmin) notFound();
  const { user, supabase } = await requireUser("/admin");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") notFound();
  return { admin: user, db: createServiceClient() };
}

export type AuditAction =
  | "view_case_facts"
  | "grant_pass"
  | "set_role"
  | "view_session"
  | "export_user"
  | "delete_user"
  | "retry_job";

/** Whether this admin logged `action` on `targetId` in the last 10 minutes: pages behind a reason check this. */
export async function recentlyAudited(db: ReturnType<typeof createServiceClient>, adminId: string, action: AuditAction, targetId: string) {
  const { data } = await db
    .from("admin_audit_log")
    .select("id")
    .eq("admin_id", adminId)
    .eq("action", action)
    .eq("target_id", targetId)
    .gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString())
    .limit(1);
  return Boolean(data?.length);
}

/** Writes the audit entry first; if it can't be written, the action doesn't happen. */
export async function audit(
  db: ReturnType<typeof createServiceClient>,
  entry: { adminId: string; action: AuditAction; targetId?: string; reason: string; details?: Record<string, unknown> },
) {
  const { error } = await db.from("admin_audit_log").insert({
    admin_id: entry.adminId,
    action: entry.action,
    target_id: entry.targetId ?? null,
    reason: entry.reason,
    details: entry.details ?? {},
  });
  if (error) throw new Error(`Audit log unavailable (${error.message}). Apply migration 20260926000005_admin.sql.`);
}

export const ghs = (pesewas: number) =>
  `GH₵${(pesewas / 100).toLocaleString("en-GH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const DAY = 24 * 60 * 60 * 1000;
export const daysAgo = (n: number, now = Date.now()) => new Date(now - n * DAY).toISOString();
export const minutesAgo = (n: number, now = Date.now()) => new Date(now - n * 60_000).toISOString();

/** The admin's date range: ?days=7|30|90|all (default 30). `since` is null for all time. */
export const RANGES = ["7", "30", "90", "all"] as const;
export type Range = (typeof RANGES)[number];
export function rangeFrom(searchParams: Record<string, string | string[] | undefined>, fallback: Range = "30") {
  const raw = typeof searchParams.days === "string" ? searchParams.days : fallback;
  const range = (RANGES as readonly string[]).includes(raw) ? (raw as Range) : fallback;
  return { range, since: range === "all" ? null : daysAgo(Number(range)), label: range === "all" ? "all time" : `last ${range} days` };
}
