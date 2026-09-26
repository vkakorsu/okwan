import type { SessionPlan } from "./director";
import { createRng } from "./random";

/**
 * Real-time behaviour the model can't do on its own, derived from the plan so
 * it's reproducible. Gemini Live only speaks after it detects the end of the
 * applicant's turn, so interruptions and "typing" silences are driven by the
 * client; end-of-turn detection is tuned per officer.
 */

export interface LiveBehaviour {
  /** Silence (ms) before the officer treats the applicant as finished. */
  endOfTurnSilenceMs: number;
  /** Seconds of continuous answering before this officer cuts in (null = never). */
  cutInAfterSec: number | null;
  /** Hold the officer's audio on this turn (1-based) to mimic typing. */
  typingSilence: { turn: number; seconds: number } | null;
  /** Hard lifetime of the Live token, which bounds the session's cost. */
  tokenLifetimeSec: number;
}

export function liveBehaviour(plan: SessionPlan): LiveBehaviour {
  const rng = createRng(`${plan.seed}:live`);
  const { patience } = plan.officer.traits;
  const interrupts = plan.events.includes("interrupt_mid_answer") || patience < 0.35;
  return {
    // Patient officers let you pause and think; impatient ones jump in sooner.
    // Never below ~0.7 s, so natural pauses in Ghanaian English aren't cut off.
    // 0.7–1.3 s. At 0.5–1.1 s the officer took a mid-sentence pause ("I'm…") as a finished
    // answer; much longer felt like lag. The officer is also told to say "Go on" to a fragment.
    endOfTurnSilenceMs: Math.round(700 + patience * 600),
    cutInAfterSec: interrupts ? Math.round(15 + patience * 20) : null,
    typingSilence: plan.events.includes("typing_silence")
      ? { turn: 2 + Math.floor(rng() * 2), seconds: Math.round((3 + rng() * 2.5) * 10) / 10 }
      : null,
    tokenLifetimeSec: Math.max(300, plan.targetDurationSec + 180),
  };
}
