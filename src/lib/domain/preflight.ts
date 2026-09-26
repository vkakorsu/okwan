/**
 * The check before stepping up to the window: can the officer hear you, can
 * you hear the officer, and will the connection hold? A bad mic or a weak
 * signal otherwise wastes an interview (often the free one).
 */

export type CheckResult = { ok: boolean; level: "good" | "warn" | "bad"; message: string };

/** Mic levels are RMS, 0..1, after the browser's noise suppression (same scale as the live window). */
export function assessMic(samples: readonly number[]): CheckResult {
  if (!samples.length) return { ok: false, level: "bad", message: "We couldn't hear anything. Check the microphone permission and try again." };
  const peak = Math.max(...samples);
  const speaking = samples.filter((s) => s > 0.02).length / samples.length;
  if (peak < 0.02) {
    return { ok: false, level: "bad", message: "We can't hear you. Check that the right microphone is selected and not muted, then try again." };
  }
  if (peak < 0.05 || speaking < 0.15) {
    return { ok: true, level: "warn", message: "You're quiet. Speak up as you would at the window, or hold the phone a little closer." };
  }
  if (peak > 0.6) {
    return { ok: true, level: "warn", message: "You're very loud or too close to the mic. Hold it a little further away." };
  }
  return { ok: true, level: "good", message: "The officer will hear you clearly." };
}

/** Round trips to our server, in ms. */
export function assessNetwork(roundTripsMs: readonly number[], effectiveType?: string): CheckResult {
  if (!roundTripsMs.length) return { ok: false, level: "bad", message: "No connection. Check your data or Wi-Fi." };
  const sorted = [...roundTripsMs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (effectiveType === "2g" || effectiveType === "slow-2g" || median > 1500) {
    return { ok: false, level: "bad", message: "Your connection is too slow for a live interview. Move to a stronger signal or Wi-Fi." };
  }
  if (effectiveType === "3g" || median > 600) {
    return { ok: true, level: "warn", message: "Your connection is slow. The officer may lag. A stronger signal will feel more real." };
  }
  return { ok: true, level: "good", message: "Your connection is good." };
}

/**
 * Data per minute at the window, in MB: the mic streamed up and the officer's
 * voice down (about 3–5 MB), plus the recording uploaded afterwards for
 * playback (about 2 MB). Per minute, not per interview: the officer decides
 * how long it lasts, so a total would hint at the plan.
 */
export const DATA_MB_PER_MINUTE = { low: 5, high: 7 } as const;
