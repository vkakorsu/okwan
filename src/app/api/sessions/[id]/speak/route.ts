import { track } from "@/lib/server/events";
import { after } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { encodeWav } from "@/lib/domain/voice";
import { features } from "@/lib/env";
import { ANSWER_VOICES, speakAnswer } from "@/lib/server/gemini";
import { errorResponse, HttpError, ownedSession } from "@/lib/server/session-access";

/**
 * "Hear it": a graded answer's stronger version, read aloud. Generated once per
 * answer and voice, then served from storage. Owner only.
 */
const Body = z.object({ seq: z.number().int().min(0).max(500), voice: z.enum(["a", "b"]).default("a") });
/** Speech generations per session: every answer in both voices, with room to spare. */
const MAX_PER_SESSION = 30;

export async function POST(req: Request, ctx: RouteContext<"/api/sessions/[id]/speak">) {
  try {
    if (!features.gemini) throw new HttpError(503, "Speech isn't configured");
    const { id } = await ctx.params;
    const { seq, voice } = Body.parse(await req.json());
    const { user, supabase, admin } = await ownedSession(id);

    const { data: turn } = await supabase.from("turns").select("scores").eq("session_id", id).eq("seq", seq).maybeSingle();
    const text = (turn?.scores as { stronger_answer?: string | null } | null)?.stronger_answer?.trim();
    if (!text) throw new HttpError(404, "No stronger answer for this question");

    // One file per answer text and voice: a re-grade with a new rewrite gets new audio.
    const hash = createHash("sha256").update(`${voice}:${text}`).digest("hex").slice(0, 16);
    const folder = `${user.id}/tts`;
    const name = `${id}-${seq}-${hash}.wav`;
    const path = `${folder}/${name}`;
    const store = admin.storage.from("recordings");

    const { data: existing } = await store.list(folder, { search: `${id}-` });
    const cached = Boolean(existing?.some((f) => f.name === name));
    // Usage and cost: each uncached play is one speech generation.
    after(() => track(user.id, "hear_it", { generated: !cached }));
    if (!cached) {
      if ((existing?.length ?? 0) >= MAX_PER_SESSION) throw new HttpError(429, "That's a lot of listening for one interview. Try another session.");
      const pcm = await speakAnswer(text, voice);
      // Copy into an aligned buffer: 16-bit samples, little-endian.
      const samples = new Int16Array(pcm.byteLength >> 1);
      new Uint8Array(samples.buffer).set(pcm.subarray(0, samples.byteLength));
      const { error } = await store.upload(path, encodeWav([samples], 24000), { contentType: "audio/wav", upsert: true });
      if (error) throw error;
    }
    const { data: signed, error } = await store.createSignedUrl(path, 3600);
    if (error || !signed) throw error ?? new Error("No signed URL");
    return Response.json({ url: signed.signedUrl, voice: ANSWER_VOICES[voice] });
  } catch (e) {
    return errorResponse(e);
  }
}
