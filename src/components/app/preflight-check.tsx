"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { assessMic, assessNetwork, DATA_MB_PER_MINUTE, type CheckResult } from "@/lib/domain/preflight";

/**
 * Before stepping up: say a line, hear it back, and time the connection.
 * Optional, but it's shown open until it has passed once on this device.
 */

const PASSED_KEY = "okwan:preflight-ok";
const RECORD_MS = 3500;

function readPassed(): boolean {
  try {
    return localStorage.getItem(PASSED_KEY) === "1";
  } catch {
    return false;
  }
}

const TONE: Record<CheckResult["level"], string> = { good: "text-approved", warn: "text-accent", bad: "text-refused" };

export function PreflightCheck() {
  // Open by default until it has passed once on this device; the applicant can toggle it.
  const passedBefore = useSyncExternalStore(() => () => {}, readPassed, () => true);
  const [toggled, setOpen] = useState<boolean | null>(null);
  const open = toggled ?? !passedBefore;
  const [running, setRunning] = useState(false);
  const [level, setLevel] = useState(0);
  const [mic, setMic] = useState<CheckResult | null>(null);
  const [net, setNet] = useState<CheckResult | null>(null);
  const [playback, setPlayback] = useState<string | null>(null);
  const cleanup = useRef<() => void>(() => {});

  useEffect(() => () => cleanup.current(), []);
  useEffect(() => () => {
    if (playback) URL.revokeObjectURL(playback);
  }, [playback]);

  async function checkNetwork(): Promise<CheckResult> {
    const times: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t = performance.now();
      try {
        await fetch(`/worklets/pcm-capture.js?ping=${Date.now()}-${i}`, { cache: "no-store" });
        times.push(performance.now() - t);
      } catch {}
    }
    const type = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType;
    return assessNetwork(times, type);
  }

  async function run() {
    setRunning(true);
    setMic(null);
    setNet(null);
    setPlayback(null);
    const netResult = checkNetwork();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      const samples: number[] = [];
      const timer = window.setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        const rms = Math.sqrt(buf.reduce((a, v) => a + v * v, 0) / buf.length);
        samples.push(rms);
        setLevel(rms);
      }, 100);
      const recorder = typeof MediaRecorder !== "undefined" ? new MediaRecorder(stream) : null;
      const chunks: Blob[] = [];
      if (recorder) {
        recorder.ondataavailable = (e) => chunks.push(e.data);
        recorder.start();
      }
      cleanup.current = () => {
        window.clearInterval(timer);
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
      };
      await new Promise((r) => window.setTimeout(r, RECORD_MS));
      if (recorder && recorder.state !== "inactive") {
        await new Promise<void>((r) => {
          recorder.onstop = () => r();
          recorder.stop();
        });
      }
      cleanup.current();
      cleanup.current = () => {};
      setLevel(0);
      const micResult = assessMic(samples);
      setMic(micResult);
      if (chunks.length) setPlayback(URL.createObjectURL(new Blob(chunks, { type: chunks[0].type })));
      const n = await netResult;
      setNet(n);
      if (micResult.ok && n.ok) {
        try {
          localStorage.setItem(PASSED_KEY, "1");
        } catch {}
      }
    } catch {
      setMic({ ok: false, level: "bad", message: "Microphone blocked. Allow the microphone for this site in your browser settings, then try again." });
      setNet(await netResult);
    } finally {
      setRunning(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm underline underline-offset-4">
        Check mic and connection
      </button>
    );
  }

  return (
    <div className="w-full border border-ink bg-paper p-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">Before you step up</p>
        <button onClick={() => setOpen(false)} className="text-xs text-muted underline">
          Hide
        </button>
      </div>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
        <li>Find a quiet spot. Headphones stop the officer&rsquo;s voice echoing into your mic.</li>
        <li>
          Press the button and say, out loud: <span className="text-fg">&ldquo;Good morning, officer. Here is my passport.&rdquo;</span>
        </li>
        <li>Listen to yourself played back.</li>
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={() => void run()}
          disabled={running}
          className="rounded-[3px] border border-ink px-4 py-2 font-semibold hover:bg-ink hover:text-on-ink disabled:opacity-60"
        >
          {running ? "Listening… speak now" : mic ? "Check again" : "Check my mic"}
        </button>
        {running && (
          <span className="h-2 w-32 border border-ink" aria-label="Mic level">
            <span className="block h-full bg-stamp" style={{ width: `${Math.min(100, level * 400)}%` }} />
          </span>
        )}
      </div>
      {mic && <p className={`mt-3 ${TONE[mic.level]}`}>Mic: {mic.message}</p>}
      {playback && (
        <div className="mt-2">
          <p className="text-muted">Can you hear yourself clearly? That&rsquo;s how the officer hears you.</p>
          <audio controls src={playback} className="mt-1 w-full max-w-sm" />
        </div>
      )}
      {net && <p className={`mt-2 ${TONE[net.level]}`}>Connection: {net.message}</p>}
      <p className="mt-3 text-xs text-muted">
        Uses about {DATA_MB_PER_MINUTE.low}–{DATA_MB_PER_MINUTE.high} MB of data a minute, including the recording saved for your playback.
      </p>
    </div>
  );
}
