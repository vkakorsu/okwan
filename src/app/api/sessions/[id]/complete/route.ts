import { after } from "next/server";
import { z } from "zod";
import { stripToolText } from "@/lib/domain/transcript";
import { features } from "@/lib/env";
import { runDebrief } from "@/lib/server/jobs";
import { finalDecision } from "@/lib/server/referee-service";
import { errorResponse, HttpError, ownedSession } from "@/lib/server/session-access";

const Body = z.object({
  turns: z
    .array(
      z.object({
        officer: z.string().max(2000),
        answer: z.string().max(4000),
        startedMs: z.number().int().min(0).nullable(),
        endedMs: z.number().int().min(0).nullable(),
        replyLatencyMs: z.number().int().min(0).max(600_000).nullable().optional(),
        interrupted: z.boolean().optional(),
      }),
    )
    .max(60),
  recordingPath: z.string().max(300).nullable(),
});

// Transcribing each answer again from the recording, then grading twice, runs after the response.
export const maxDuration = 300;

/** Stores the transcript, finalises the outcome, and grades the debrief in the background. */
export async function POST(req: Request, ctx: RouteContext<"/api/sessions/[id]/complete">) {
  try {
    const { id } = await ctx.params;
    const { session, admin, user } = await ownedSession(id);
    if (session.ended_at) return Response.json({ ok: true, already: true });
    const body = Body.parse(await req.json());
    if (body.recordingPath && !body.recordingPath.startsWith(`${user.id}/`)) throw new HttpError(400, "Bad recording path");

    if (body.turns.length) {
      await admin.from("turns").insert(
        body.turns.map((t, i) => ({
          session_id: id,
          seq: i + 1,
          officer_text: stripToolText(t.officer) || "(silence)",
          user_transcript_raw: t.answer,
          started_ms: t.startedMs,
          ended_ms: t.endedMs,
          reply_latency_ms: t.replyLatencyMs ?? null,
          interrupted: Boolean(t.interrupted),
        })),
      );
    }
    const elapsedSec = session.started_at ? (Date.now() - new Date(session.started_at).getTime()) / 1000 : 0;
    const decision =
      session.plan.mode === "drill"
        ? { outcome: null, reasons: [] as string[] }
        : finalDecision(session.plan, session.referee_state, elapsedSec);
    await admin
      .from("sessions")
      .update({
        ended_at: new Date().toISOString(),
        outcome: decision.outcome,
        decision_reasons: decision.reasons,
        recording_path: body.recordingPath,
      })
      .eq("id", id);
    if (features.gemini) after(() => runDebrief(id));
    return Response.json({ ok: true, outcome: decision.outcome });
  } catch (e) {
    return errorResponse(e);
  }
}
