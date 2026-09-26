"use client";

import { FunctionResponseScheduling, GoogleGenAI, type LiveServerMessage, type Session } from "@google/genai";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PreflightCheck } from "@/components/app/preflight-check";
import { Guilloche } from "@/components/guilloche";
import type { LiveBehaviour } from "@/lib/domain/live-behaviour";
import { encodeWav } from "@/lib/domain/voice";
import { createClient } from "@/lib/supabase/browser";

/**
 * The Window: a real-time voice interview with the Officer (Gemini Live).
 * The browser holds only a single-use token with the officer's config locked
 * server-side. Tool calls are relayed to the server Referee.
 */

type Phase = "ready" | "connecting" | "live" | "ending" | "error";
interface Turn {
  officer: string;
  answer: string;
  /** When the applicant's voice started and stopped (mic-based; transcription arrives late). */
  startedMs: number | null;
  endedMs: number | null;
  /** From the end of this answer to the officer's next audio. */
  replyLatencyMs: number | null;
  /** The officer started speaking before the applicant had finished (a cut-in, or talking over them). */
  interrupted?: boolean;
}

interface Props {
  sessionId: string;
  userId: string;
  officerName: string;
  targetDurationSec: number;
  isFree: boolean;
  /** One-question drill: no greeting, no passport, straight to the question. */
  drill?: boolean;
  supabaseUrl: string;
  publishableKey: string;
}

function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(b64: string) {
  const bin = atob(b64);
  const out = new Int16Array(bin.length / 2);
  for (let i = 0; i < out.length; i++) {
    const lo = bin.charCodeAt(i * 2);
    const hi = bin.charCodeAt(i * 2 + 1);
    out[i] = (hi << 8) | lo;
  }
  return out;
}

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Tools the officer waits on (see BLOCKING_TOOLS in src/lib/server/gemini.ts). */
const BLOCKING_TOOLS = new Set(["end_interview", "request_document", "scan_fingerprints"]);
/** 100 ms chunks: stop recording after 8 minutes. */
const MAX_RECORDING_CHUNKS = 4800;
/** Mic RMS above this counts as speech (after browser noise suppression). */
const VOICE_LEVEL = 0.02;
/** How long after the applicant stops talking before a silent officer is prompted. */
const NO_REPLY_MS = 3500;
/** How long after "Passport, please" before assuming the documents were passed. */
const HANDOVER_MS = 8000;
/** Reconnects allowed after a dropped line (the token route allows 3 tokens per session). */
const MAX_RECONNECTS = 3;
/** Mic level that means the applicant is still talking over the officer (well above echo after cancellation). */
const TALK_OVER_LEVEL = 0.06;
/** How long after the officer starts that the applicant still talking counts as being cut off. */
const TALK_OVER_WINDOW_MS = 1500;
/** Times the officer may be asked to let the applicant finish before ending. */
const MAX_END_DEFERRALS = 2;

export function LiveRoom(props: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("ready");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [officerLevel, setOfficerLevel] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  /** A document the officer is waiting for: shown as a button, like passing it through the slot. */
  const [handover, setHandover] = useState<{ prompt: React.ReactNode; action: string; canDecline: boolean } | null>(null);
  const handoverRef = useRef<((given: boolean) => void) | null>(null);
  const openingOfferedRef = useRef(false);
  const [status, setStatus] = useState("");

  const sessionRef = useRef<Session | null>(null);
  const startRef = useRef(0);
  const turnsRef = useRef<Turn[]>([]);
  const lastSpeakerRef = useRef<"officer" | "user" | null>(null);
  const decidedRef = useRef(false);
  const wrapSentRef = useRef(false);
  const finishingRef = useRef(false);
  const cleanupRef = useRef<() => void>(() => {});
  const playRef = useRef<{ ctx: AudioContext; analyser: AnalyserNode; next: number; sources: AudioBufferSourceNode[] } | null>(null);
  /** Mic audio since the session clock started (src/lib/domain/voice.ts). */
  const pcmRef = useRef<Int16Array[]>([]);
  // Client-timed realism (src/lib/domain/live-behaviour.ts).
  const behaviourRef = useRef<LiveBehaviour | null>(null);
  const officerTurnRef = useRef(0);
  const officerSpeakingRef = useRef(false);
  const answerSinceRef = useRef<number | null>(null);
  const cutInSentRef = useRef(false);
  /** Last time the applicant's mic heard speech, and the officer was last audible. */
  const lastVoiceAtRef = useRef(0);
  const lastOfficerAtRef = useRef(0);
  const nudgedRef = useRef(false);
  // Reconnecting after a dropped line (Gemini Live session resumption).
  const tokenRef = useRef<{ token: string; model: string } | null>(null);
  const resumeHandleRef = useRef<string | null>(null);
  const connectionRef = useRef(0);
  const reconnectsRef = useRef(0);
  const reconnectingRef = useRef(false);
  /** When the officer's current turn started to be heard, to catch the applicant still talking. */
  const officerStartedAtRef = useRef(0);
  const endDeferralsRef = useRef(0);
  /** After the verdict: the decision line, the officer's words since, and where to stop playing. */
  const decisionLineRef = useRef<string | null>(null);
  const afterDecisionTextRef = useRef("");
  const playUntilRef = useRef<number | null>(null);

  const now = () => Date.now() - startRef.current;

  function currentTurn(): Turn {
    const t = turnsRef.current;
    if (!t.length) t.push({ officer: "", answer: "", startedMs: null, endedMs: null, replyLatencyMs: null });
    return t[t.length - 1];
  }

  function onOfficerText(text: string) {
    if (lastSpeakerRef.current === "user") {
      turnsRef.current.push({ officer: "", answer: "", startedMs: null, endedMs: null, replyLatencyMs: null });
    }
    lastSpeakerRef.current = "officer";
    currentTurn().officer += text;
  }

  function onUserText(text: string) {
    const turn = currentTurn();
    // Fallback only: the mic sets these as the applicant speaks.
    if (turn.startedMs === null) turn.startedMs = now();
    if (turn.endedMs === null) turn.endedMs = now();
    turn.answer += text;
    lastSpeakerRef.current = "user";
  }

  function playPcm(b64: string) {
    const p = playRef.current;
    if (!p) return;
    // After the decision line, anything more the officer says is dropped.
    if (playUntilRef.current !== null && p.next >= playUntilRef.current) return;
    const pcm = fromBase64(b64);
    const buffer = p.ctx.createBuffer(1, pcm.length, 24000);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
    const src = p.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(p.analyser);
    if (!officerSpeakingRef.current) {
      // First audio of a new officer turn.
      officerSpeakingRef.current = true;
      nudgedRef.current = false;
      const answered = turnsRef.current.at(-1);
      if (answered && answered.startedMs !== null && answered.replyLatencyMs === null && lastVoiceAtRef.current > lastOfficerAtRef.current) {
        answered.replyLatencyMs = Date.now() - lastVoiceAtRef.current;
      }
      officerTurnRef.current += 1;
      answerSinceRef.current = null;
      officerStartedAtRef.current = Date.now();
      const silence = behaviourRef.current?.typingSilence;
      if (silence && silence.turn === officerTurnRef.current) {
        // The officer looks down and types before speaking. Say so, or it reads as lag.
        p.next = Math.max(p.next, p.ctx.currentTime + silence.seconds);
        setStatus("The officer is typing…");
        window.setTimeout(() => setStatus(""), silence.seconds * 1000);
      }
    }
    const at = Math.max(p.ctx.currentTime + 0.02, p.next);
    src.start(at);
    p.next = at + buffer.duration;
    p.sources.push(src);
    src.onended = () => {
      p.sources = p.sources.filter((s) => s !== src);
    };
  }

  function stopPlayback() {
    const p = playRef.current;
    if (!p) return;
    p.sources.forEach((s) => {
      try {
        s.stop();
      } catch {}
    });
    p.sources = [];
    p.next = p.ctx.currentTime;
  }

  function referee(text: string) {
    sessionRef.current?.sendClientContent({ turns: [{ role: "user", parts: [{ text: `[REFEREE] ${text}` }] }], turnComplete: true });
  }

  /** Shows the handover button; resolves when it's pressed, the applicant speaks, or after a timeout. */
  function askHandover(label: string, canDecline: boolean, timeoutMs: number): Promise<boolean> {
    return askAction(
      <>
        The officer is waiting for your <strong>{label}</strong>.
      </>,
      "Pass it through the slot ▸",
      canDecline,
      timeoutMs,
    );
  }

  /** A physical step at the window, as a button: resolves when pressed, declined, or after a timeout. */
  function askAction(prompt: React.ReactNode, action: string, canDecline: boolean, timeoutMs: number): Promise<boolean> {
    handoverRef.current?.(true);
    setHandover({ prompt, action, canDecline });
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => done(true), timeoutMs);
      function done(given: boolean) {
        window.clearTimeout(timer);
        if (handoverRef.current === done) handoverRef.current = null;
        setHandover(null);
        resolve(given);
      }
      handoverRef.current = done;
    });
  }

  function offerOpeningHandover(officerLine: string) {
    if (openingOfferedRef.current) return;
    openingOfferedRef.current = true;
    const label = /I-?20/i.test(officerLine) ? "passport and I-20" : /DS-?2019/i.test(officerLine) ? "passport and DS-2019" : "passport";
    // Speaking ("Here you go") also counts: the voice handler resolves it and the officer hears you.
    void askHandover(label, false, HANDOVER_MS).then((pressed) => {
      if (pressed && lastVoiceAtRef.current <= lastOfficerAtRef.current) {
        nudgedRef.current = true;
        referee(`The applicant has passed the ${label} through the slot. Continue.`);
      }
    });
  }

  async function relay(call: { name?: string; args?: Record<string, unknown> }) {
    const res = await fetch(`/api/sessions/${props.sessionId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: call.name, args: call.args ?? {} }),
    });
    return (await res.json()) as { response?: Record<string, unknown>; speak?: boolean; wrapUp?: boolean };
  }

  function wrapUpIfDue(result: { wrapUp?: boolean }) {
    if (result.wrapUp && !wrapSentRef.current) {
      wrapSentRef.current = true;
      referee("You have heard enough. Call end_interview now.");
    }
  }

  async function handleToolCalls(msg: LiveServerMessage) {
    const calls = msg.toolCall?.functionCalls ?? [];
    for (const call of calls) {
      if (!BLOCKING_TOOLS.has(call.name ?? "")) {
        // Bookkeeping (log_probe and friends): answer at once, without waiting for
        // the server. If the officer's turn was only this call, WHEN_IDLE makes it
        // go on to the next question now instead of sitting in silence.
        const officerQuiet = lastVoiceAtRef.current > lastOfficerAtRef.current;
        if (call.name === "log_probe") {
          // How long the answer really was, from the mic: the model's own estimate is unreliable.
          const answered = [...turnsRef.current].reverse().find((t) => t.startedMs !== null && t.endedMs !== null);
          if (answered) call.args = { ...(call.args ?? {}), answer_seconds: Math.round((answered.endedMs! - answered.startedMs!) / 100) / 10 };
        }
        sessionRef.current?.sendToolResponse({
          functionResponses: [
            {
              id: call.id,
              name: call.name,
              response: officerQuiet ? { recorded: true, instruction: "Continue the interview now." } : { recorded: true },
              scheduling: officerQuiet ? FunctionResponseScheduling.WHEN_IDLE : FunctionResponseScheduling.SILENT,
            },
          ],
        });
        void relay(call).then(wrapUpIfDue, () => {});
        continue;
      }
      try {
        if (call.name === "end_interview" && Date.now() - lastVoiceAtRef.current < 900 && endDeferralsRef.current < MAX_END_DEFERRALS) {
          // The applicant is still mid-answer: let them finish before the decision.
          endDeferralsRef.current += 1;
          sessionRef.current?.sendToolResponse({
            functionResponses: [
              {
                id: call.id,
                name: call.name,
                response: { deferred: true, instruction: "The applicant is still speaking. Let them finish, then call end_interview again." },
                scheduling: FunctionResponseScheduling.WHEN_IDLE,
              },
            ],
          });
          continue;
        }
        if (call.name === "scan_fingerprints") {
          for (const hand of ["left four fingers", "right four fingers", "both thumbs"]) {
            await askAction(
              <>
                Officer: &ldquo;Put your <strong>{hand}</strong> on the scanner.&rdquo;
              </>,
              "Place them on the scanner ▸",
              false,
              7000,
            );
          }
        }
        if (call.name === "request_document") {
          const label = String(call.args?.document ?? "document");
          const given = await askHandover(label, true, 12_000);
          if (!given) {
            void relay({ name: "log_document", args: { document: label, provided: false } });
            sessionRef.current?.sendToolResponse({
              functionResponses: [
                {
                  id: call.id,
                  name: call.name,
                  response: { available: false, applicant_says: "I don't have it with me." },
                  scheduling: FunctionResponseScheduling.WHEN_IDLE,
                },
              ],
            });
            continue;
          }
        }
        const result = await relay(call);
        if (call.name === "end_interview") {
          decidedRef.current = true;
          const line = result.response?.say_exactly;
          if (typeof line === "string") decisionLineRef.current = line;
        }
        sessionRef.current?.sendToolResponse({
          functionResponses: [
            {
              id: call.id,
              name: call.name,
              response: result.response ?? { ok: true },
              scheduling: result.speak ? FunctionResponseScheduling.WHEN_IDLE : FunctionResponseScheduling.SILENT,
            },
          ],
        });
        wrapUpIfDue(result);
      } catch {
        sessionRef.current?.sendToolResponse({
          functionResponses: [{ id: call.id, name: call.name, response: { ok: false }, scheduling: FunctionResponseScheduling.WHEN_IDLE }],
        });
      }
    }
  }

  function onMessage(msg: LiveServerMessage) {
    const sc = msg.serverContent;
    if (sc?.interrupted) stopPlayback();
    if (!props.drill && sc?.turnComplete && officerTurnRef.current === 1 && lastVoiceAtRef.current <= lastOfficerAtRef.current) {
      offerOpeningHandover(turnsRef.current[0]?.officer ?? "");
    }
    if (sc?.turnComplete || sc?.interrupted) officerSpeakingRef.current = false;
    for (const part of sc?.modelTurn?.parts ?? []) {
      if (part.inlineData?.data) playPcm(part.inlineData.data);
    }
    if (sc?.outputTranscription?.text) {
      onOfficerText(sc.outputTranscription.text);
      if (decisionLineRef.current && playUntilRef.current === null) {
        // Once the decision line has been said, stop there: officers don't carry on.
        afterDecisionTextRef.current += sc.outputTranscription.text;
        const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
        const tail = norm(decisionLineRef.current).split(" ").slice(-3).join(" ");
        const p = playRef.current;
        if (tail && norm(afterDecisionTextRef.current).includes(tail) && p) {
          playUntilRef.current = p.next + 0.3;
          window.setTimeout(() => void finish(), Math.max(0, (p.next - p.ctx.currentTime) * 1000) + 1500);
        }
      }
    }
    if (sc?.inputTranscription?.text) onUserText(sc.inputTranscription.text);
    if (sc?.turnComplete && decidedRef.current) {
      // Let the decision line finish playing, then leave the window.
      const p = playRef.current;
      const wait = p ? Math.max(0, (p.next - p.ctx.currentTime) * 1000) + 1200 : 1500;
      window.setTimeout(() => void finish(), wait);
    }
    if (msg.toolCall) void handleToolCalls(msg);
    // The latest point this interview can be resumed from if the line drops.
    const update = msg.sessionResumptionUpdate;
    if (update?.resumable && update.newHandle) resumeHandleRef.current = update.newHandle;
  }

  /** Opens a Live connection; with a handle it resumes the same interview. Events from older connections are ignored. */
  async function openLive(token: string, model: string, handle: string | null): Promise<Session> {
    const id = ++connectionRef.current;
    const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: "v1alpha" } });
    return ai.live.connect({
      model,
      config: handle ? { sessionResumption: { handle } } : {},
      callbacks: {
        onmessage: (msg) => {
          if (id === connectionRef.current) onMessage(msg);
        },
        onerror: () => {
          if (id === connectionRef.current) void lineDropped();
        },
        onclose: () => {
          if (id === connectionRef.current) void lineDropped();
        },
      },
    });
  }

  /**
   * The connection closed without us closing it: on mobile data this is usually
   * a blip. Resume the same interview (same officer, same questions so far)
   * rather than ending it; give up after a few tries.
   */
  async function lineDropped() {
    if (finishingRef.current || reconnectingRef.current) return;
    if (decidedRef.current) return void finish();
    const handle = resumeHandleRef.current;
    const creds = tokenRef.current;
    if (!handle || !creds || reconnectsRef.current >= MAX_RECONNECTS) {
      setError("The connection dropped.");
      return void finish();
    }
    reconnectingRef.current = true;
    reconnectsRef.current += 1;
    sessionRef.current = null;
    stopPlayback();
    setStatus("The line dropped. Reconnecting…");
    try {
      let session: Session;
      try {
        session = await openLive(creds.token, creds.model, handle);
      } catch {
        // The first token may not open another connection: ask for a resume token.
        const res = await fetch(`/api/sessions/${props.sessionId}/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resume: true }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Couldn't reconnect");
        tokenRef.current = { token: json.token, model: json.model };
        session = await openLive(json.token, json.model, handle);
      }
      sessionRef.current = session;
      setStatus("Reconnected.");
      window.setTimeout(() => setStatus((s) => (s === "Reconnected." ? "" : s)), 2500);
      referee("The line dropped for a few seconds. Carry on exactly where you left off. If you were asking a question, ask it again briefly.");
    } catch {
      setError("The connection dropped and couldn't be restored.");
      void finish();
    } finally {
      reconnectingRef.current = false;
    }
  }

  async function finish() {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setPhase("ending");
    setStatus("Saving your interview…");
    cleanupRef.current();

    let recordingPath: string | null = null;
    if (pcmRef.current.length) {
      try {
        // 16 kHz WAV, aligned with the turn timings: used for playback and a
        // second, more accurate transcript of each answer.
        const blob = new Blob([encodeWav(pcmRef.current)], { type: "audio/wav" });
        const path = `${props.userId}/${props.sessionId}.wav`;
        const supabase = createClient(props.supabaseUrl, props.publishableKey);
        const { error } = await supabase.storage.from("recordings").upload(path, blob, { upsert: true, contentType: "audio/wav" });
        if (!error) recordingPath = path;
      } catch {}
      pcmRef.current = [];
    }
    const turns = turnsRef.current.filter((t) => t.officer.trim() || t.answer.trim());
    await fetch(`/api/sessions/${props.sessionId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turns, recordingPath }),
    });
    router.replace(`/app/sessions/${props.sessionId}/debrief`);
  }

  async function start() {
    setPhase("connecting");
    setError(null);
    try {
      const tokenRes = await fetch(`/api/sessions/${props.sessionId}/token`, { method: "POST" });
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenJson.error ?? "Couldn't open the window");
      behaviourRef.current = tokenJson.behaviour ?? null;

      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      // Release the mic if anything below fails before the full cleanup is wired up.
      cleanupRef.current = () => mic.getTracks().forEach((t) => t.stop());

      const playCtx = new AudioContext({ sampleRate: 24000 });
      const analyser = playCtx.createAnalyser();
      analyser.fftSize = 256;
      // A touch of "through the glass": gentle low-pass on the officer's voice.
      const glass = playCtx.createBiquadFilter();
      glass.type = "lowpass";
      glass.frequency.value = 5200;
      analyser.connect(glass).connect(playCtx.destination);
      playRef.current = { ctx: playCtx, analyser, next: 0, sources: [] };

      const capCtx = new AudioContext();
      await capCtx.audioWorklet.addModule("/worklets/pcm-capture.js");
      const node = new AudioWorkletNode(capCtx, "pcm-capture");
      capCtx.createMediaStreamSource(mic).connect(node);


      tokenRef.current = { token: tokenJson.token, model: tokenJson.model };
      sessionRef.current = await openLive(tokenJson.token, tokenJson.model, null);

      node.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
        setMicLevel(e.data.level);
        if (startRef.current && pcmRef.current.length < MAX_RECORDING_CHUNKS) pcmRef.current.push(new Int16Array(e.data.pcm));
        const p = playRef.current;
        const officerAudible = p ? p.next > p.ctx.currentTime : false;
        // Still talking loudly just after the officer started: the officer cut them off.
        if (officerAudible && e.data.level > TALK_OVER_LEVEL && Date.now() - officerStartedAtRef.current < TALK_OVER_WINDOW_MS) {
          // The answer is the latest turn the applicant spoke in (the officer's new turn has no voice yet).
          const answered = [...turnsRef.current].reverse().find((t) => t.startedMs !== null);
          if (answered) answered.interrupted = true;
        }
        // Ignore echo of the officer's own voice.
        if (e.data.level > VOICE_LEVEL && !officerAudible) {
          const t = Date.now();
          if (lastVoiceAtRef.current <= lastOfficerAtRef.current) {
            // First speech since the officer spoke: a new answer begins.
            answerSinceRef.current = t;
            cutInSentRef.current = false;
          }
          lastVoiceAtRef.current = t;
          nudgedRef.current = false;
          if (handoverRef.current && officerTurnRef.current === 1 && !props.drill) handoverRef.current(false);
          if (startRef.current) {
            const turn = currentTurn();
            if (turn.startedMs === null) turn.startedMs = t - startRef.current;
            turn.endedMs = t - startRef.current;
          }
        }
        // After the verdict the officer isn't listening any more (and mustn't start a new turn).
        if (!decidedRef.current) sessionRef.current?.sendRealtimeInput({ audio: { data: toBase64(e.data.pcm), mimeType: "audio/pcm;rate=16000" } });
      };

      const levels = new Uint8Array(analyser.frequencyBinCount);
      const meter = window.setInterval(() => {
        analyser.getByteFrequencyData(levels);
        setOfficerLevel(levels.reduce((a, b) => a + b, 0) / levels.length / 255);
        setElapsed(Math.floor(now() / 1000));
        // Keep the window from going dead. The model sometimes ends its turn
        // with only a tool call, and most people pass documents over silently.
        const t = Date.now();
        if (officerSpeakingRef.current || playCtx.currentTime < (playRef.current?.next ?? 0)) lastOfficerAtRef.current = t;
        const voice = lastVoiceAtRef.current;
        const officer = lastOfficerAtRef.current;
        if (officer && !nudgedRef.current && !decidedRef.current) {
          if (voice > officer && t - voice > NO_REPLY_MS) {
            nudgedRef.current = true;
            referee("The applicant has finished answering. Ask your next question now, or call end_interview if you have heard enough.");
          }
        }
        // An impatient officer cuts in on a long answer.
        const cutIn = behaviourRef.current?.cutInAfterSec;
        const since = answerSinceRef.current;
        if (cutIn && since && !cutInSentRef.current && !decidedRef.current && Date.now() - since > cutIn * 1000) {
          cutInSentRef.current = true;
          const answering = [...turnsRef.current].reverse().find((t) => t.startedMs !== null);
          if (answering) answering.interrupted = true;
          referee(`Cut in. The applicant has been answering for ${cutIn} seconds.`);
        }
      }, 100);

      cleanupRef.current = () => {
        window.clearInterval(meter);
        node.port.onmessage = null;
        mic.getTracks().forEach((t) => t.stop());
        void capCtx.close();
        // Our own close isn't a dropped line: stop listening first.
        connectionRef.current += 1;
        try {
          sessionRef.current?.close();
        } catch {}
        sessionRef.current = null;
      };

      startRef.current = Date.now();
      setPhase("live");
      setStatus("");
      referee(
        props.drill
          ? "The applicant is at your window for a one-question drill. Ask your question now."
          : "The applicant has stepped up to your window. Greet them briefly and begin.",
      );
    } catch (e) {
      cleanupRef.current();
      setPhase("error");
      setError(e instanceof Error ? e.message : "Couldn't start. Check your microphone permission.");
    }
  }

  // Time limits: nudge the officer to decide, then hard-stop.
  useEffect(() => {
    if (phase !== "live") return;
    if (elapsed >= props.targetDurationSec + 15 && !wrapSentRef.current) {
      wrapSentRef.current = true;
      referee("Time is up. Call end_interview now.");
    }
    if (elapsed >= props.targetDurationSec + 75) void finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, phase]);

  useEffect(() => () => cleanupRef.current(), []);

  const bars = 40;
  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6 sm:py-10">
        <div className="doc relative flex flex-1 flex-col overflow-hidden">
          <Guilloche className="guilloche pointer-events-none absolute -right-52 -top-52 w-[560px]" />
          <div className="relative flex items-center justify-between border-b border-ink px-5 py-3">
            <span className="label">Window 07 · {props.drill ? "One-question drill" : props.isFree ? "Free mock" : "Practice interview"}</span>
            <span className="label tabular" aria-label="Time at the window">
              {phase === "live" || phase === "ending" ? fmt(elapsed) : "00:00"}
            </span>
          </div>

          <div className="relative flex flex-1 flex-col justify-center px-6 py-10 sm:px-10">
            <span className="stamp w-fit text-stamp">{props.officerName}</span>
            <div className="mt-10 flex h-24 items-center gap-[3px]" aria-hidden>
              {Array.from({ length: bars }, (_, i) => {
                const h = Math.max(0.06, Math.min(1, officerLevel * 3.2 * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.3 + elapsed)))));
                return <span key={i} className="w-[4px] bg-ink transition-[height] duration-100" style={{ height: `${h * 100}%` }} />;
              })}
            </div>
            <p aria-live="polite" className="font-voice mt-8 text-[clamp(1.6rem,3.2vw,2.3rem)] leading-tight">
              {phase === "ready" && "Stand up. Take a breath. When you're ready, step up to the window."}
              {phase === "connecting" && "The officer is looking at your file…"}
              {phase === "live" && (status || "Speak naturally. The officer may interrupt you, and decides when they've heard enough.")}
              {phase === "ending" && status}
              {phase === "error" && error}
            </p>
          </div>

          {phase === "live" && handover && (
            <div className="relative mx-5 mb-4 flex flex-wrap items-center justify-between gap-3 border border-ink bg-paper px-4 py-3 sm:mx-8">
              <span className="text-sm">{handover.prompt}</span>
              <span className="flex gap-2">
                <button
                  onClick={() => handoverRef.current?.(true)}
                  className="rounded-[3px] bg-ink px-4 py-2 text-sm font-semibold text-on-ink hover:bg-stamp"
                >
                  {handover.action}
                </button>
                {handover.canDecline && (
                  <button onClick={() => handoverRef.current?.(false)} className="text-sm underline underline-offset-4">
                    I don&rsquo;t have it
                  </button>
                )}
              </span>
            </div>
          )}
          {(phase === "ready" || phase === "error") && (
            <div className="relative mx-5 mb-4 sm:mx-8">
              <PreflightCheck targetDurationSec={props.targetDurationSec} />
            </div>
          )}
          <div className="perforated" />
          <div className="relative flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
            {phase === "ready" || phase === "error" ? (
              <button onClick={start} className="rounded-[3px] bg-ink px-6 py-3.5 font-semibold text-on-ink hover:bg-stamp">
                Step up to the window
              </button>
            ) : phase === "live" ? (
              <>
                <div className="flex items-center gap-3">
                  <span className="label text-muted">Your mic</span>
                  <span className="h-2 w-32 border border-ink">
                    <span className="block h-full bg-stamp" style={{ width: `${Math.min(100, micLevel * 400)}%` }} />
                  </span>
                </div>
                <button onClick={() => void finish()} className="text-sm underline underline-offset-4">
                  Leave the window
                </button>
              </>
            ) : (
              <span className="label text-muted">Saving…</span>
            )}
          </div>
        </div>
        <p className="mx-auto mt-4 max-w-md text-center text-xs text-muted">
          Practice simulation. The outcome is a training signal, not a prediction. Uses about 3–5 MB of data per minute.
        </p>
      </div>
    </div>
  );
}
