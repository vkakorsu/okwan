"use client";

import { useActionState, useState } from "react";
import { createShare, revokeShare, type ShareState } from "@/app/app/actions";
import { formatDate } from "@/lib/labels";

/**
 * Share this debrief with a parent, sponsor or counsellor: a read-only link
 * that expires in 30 days and can be stopped any time. No recording, no
 * documents, first name only.
 */
export function ShareDebrief({
  sessionId,
  siteUrl,
  active,
}: {
  sessionId: string;
  siteUrl: string;
  active: { token: string; expires_at: string }[];
}) {
  const [state, action, pending] = useActionState<ShareState, FormData>(createShare.bind(null, sessionId), {});
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="text-sm">
      <p className="text-muted">
        A read-only link for a parent, sponsor or counsellor: your answers, scores and coaching, with your first name only. No recording,
        no documents. It works for 30 days, and you can stop it any time.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <form action={action}>
          <button disabled={pending} className="rounded-[3px] bg-ink px-4 py-2 font-semibold text-on-ink hover:bg-stamp disabled:opacity-60">
            {pending ? "Creating…" : "Create a share link"}
          </button>
        </form>
        <button onClick={() => window.print()} className="rounded-[3px] border border-ink px-4 py-2 font-semibold hover:bg-ink hover:text-on-ink">
          Print or save as PDF
        </button>
      </div>
      {state.error && <p role="alert" className="mt-2 text-refused">{state.error}</p>}
      {state.url && (
        <p className="mt-3 break-all">
          <span className="font-mono text-xs">{state.url}</span>{" "}
          <button onClick={() => void copy(state.url!)} className="underline underline-offset-2">
            {copied === state.url ? "Copied" : "Copy"}
          </button>
        </p>
      )}
      {active.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {active.map((s) => {
            const url = `${siteUrl}/share/${s.token}`;
            return (
              <li key={s.token} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-xs text-muted">
                  Link …{s.token.slice(-6)} · until {formatDate(s.expires_at)}
                </span>
                <span className="flex gap-3">
                  <button onClick={() => void copy(url)} className="text-xs underline underline-offset-2">
                    {copied === url ? "Copied" : "Copy"}
                  </button>
                  <form action={revokeShare.bind(null, s.token)}>
                    <button className="text-xs text-refused underline underline-offset-2">Stop sharing</button>
                  </form>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
