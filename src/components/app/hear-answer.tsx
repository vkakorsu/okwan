"use client";

import { useRef, useState } from "react";

/**
 * Plays the stronger answer read aloud. The first play takes a few seconds
 * (the speech is generated once, then kept), so the button says so.
 */
export function HearAnswer({ sessionId, seq }: { sessionId: string; seq: number }) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [voice, setVoice] = useState<"a" | "b">("a");
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const urls = useRef<Partial<Record<"a" | "b", string>>>({});

  async function play(v: "a" | "b") {
    audio.current?.pause();
    setError(null);
    try {
      let url = urls.current[v];
      if (!url) {
        setState("loading");
        const res = await fetch(`/api/sessions/${sessionId}/speak`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seq, voice: v }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Couldn't make the audio");
        url = json.url as string;
        urls.current[v] = url;
      }
      const el = new Audio(url);
      audio.current = el;
      el.onended = () => setState("idle");
      setState("playing");
      await el.play();
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Couldn't play it");
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
      <button
        onClick={() => (state === "playing" ? (audio.current?.pause(), setState("idle")) : void play(voice))}
        disabled={state === "loading"}
        className="rounded-[3px] border border-ink px-3 py-1.5 font-semibold hover:bg-ink hover:text-on-ink disabled:opacity-60"
      >
        {state === "loading" ? "Preparing… (a few seconds)" : state === "playing" ? "Stop" : "▶ Hear it"}
      </button>
      <span className="text-xs text-muted">
        Voice{" "}
        {(["a", "b"] as const).map((v) => (
          <button
            key={v}
            onClick={() => {
              setVoice(v);
              if (state === "playing") void play(v);
            }}
            className={`ml-1 underline-offset-2 ${voice === v ? "font-semibold text-fg underline" : "hover:underline"}`}
          >
            {v === "a" ? "lower" : "higher"}
          </button>
        ))}
      </span>
      {error && <span className="text-xs text-refused">{error}</span>}
    </div>
  );
}
