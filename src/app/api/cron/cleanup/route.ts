import { timingSafeEqual } from "node:crypto";
import { features } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Daily: deletes documents past their `delete_after` date (default 30 days),
 * both the stored file and the row; voice recordings (and "hear it" audio)
 * 30 days after the session; sessions never started. Vercel Cron calls this
 * with CRON_SECRET.
 */
const RECORDING_DAYS = 30;
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || auth.length !== expected.length || !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!features.supabaseAdmin) return new Response("Not configured", { status: 503 });

  const db = createServiceClient();
  let deleted = 0;
  for (;;) {
    const { data: expired } = await db
      .from("documents")
      .select("id, storage_path")
      .lt("delete_after", new Date().toISOString())
      .limit(100);
    if (!expired?.length) break;
    await db.storage.from("documents").remove(expired.map((d) => d.storage_path));
    await db.from("documents").delete().in("id", expired.map((d) => d.id));
    deleted += expired.length;
    if (expired.length < 100) break;
  }
  // Voice recordings and the stronger answers read aloud for them, 30 days after the session.
  let recordings = 0;
  const cutoff = new Date(Date.now() - RECORDING_DAYS * 24 * 60 * 60 * 1000).toISOString();
  for (;;) {
    const { data: old } = await db
      .from("sessions")
      .select("id, recording_path")
      .not("recording_path", "is", null)
      .lt("ended_at", cutoff)
      .limit(100);
    if (!old?.length) break;
    const paths = old.map((s) => s.recording_path as string);
    for (const s of old) {
      const owner = String(s.recording_path).split("/")[0];
      const { data: tts } = await db.storage.from("recordings").list(`${owner}/tts`, { search: `${s.id}-` });
      paths.push(...(tts ?? []).map((f) => `${owner}/tts/${f.name}`));
    }
    await db.storage.from("recordings").remove(paths);
    await db.from("sessions").update({ recording_path: null }).in("id", old.map((s) => s.id));
    recordings += old.length;
    if (old.length < 100) break;
  }
  // Sessions created by clicking a mode but never started.
  const { count: unstarted } = await db
    .from("sessions")
    .delete({ count: "exact" })
    .is("started_at", null)
    .lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  return Response.json({ deleted, recordings, unstarted: unstarted ?? 0 });
}
