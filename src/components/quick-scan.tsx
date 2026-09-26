"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Field, inputCls } from "@/components/app/ui";
import { Checklist, FlagList, QuestionList } from "@/components/case-report";
import { scanCase } from "@/lib/domain/case-scan";
import { likelyQuestions, whatToBring } from "@/lib/domain/checklist";
import { QuickScanInput, quickScanProfile } from "@/lib/domain/quick-scan";

/** Kept in the browser so the answers carry into a real case after signup. */
export const SCAN_STORAGE_KEY = "okwan:scan:v1";

type Result = ReturnType<typeof run>;

function run(input: QuickScanInput, ghsPerUsd?: number) {
  const { profile, draft } = quickScanProfile(input, ghsPerUsd);
  return { flags: scanCase(profile), questions: likelyQuestions(profile), checklist: whatToBring(profile), draft };
}

/** `ghsPerUsd`: the server's configured rate (FX_GHS_PER_USD), so the scan converts cedis like the rest of the app. */
export function QuickScan({ signedIn, ghsPerUsd }: { signedIn: boolean; ghsPerUsd?: number }) {
  const [visa, setVisa] = useState<"F1" | "B1B2">("F1");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = Object.fromEntries([...new FormData(e.currentTarget)].filter(([, v]) => v !== ""));
    const parsed = QuickScanInput.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(`Check "${String(issue.path[0])}": ${issue.message}`);
      return;
    }
    setError(null);
    const r = run(parsed.data, ghsPerUsd);
    setResult(r);
    try {
      localStorage.setItem(SCAN_STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), draft: r.draft }));
    } catch {}
    requestAnimationFrame(() => document.getElementById("scan-result")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
      <form onSubmit={onSubmit} className="doc grid content-start gap-5 self-start p-6" noValidate>
        <fieldset className="grid gap-4">
          <legend className="label mb-3 text-muted">01 · You</legend>
          <div className="grid grid-cols-2 gap-3">
            {(["F1", "B1B2"] as const).map((v) => (
              <label key={v} className={`cursor-pointer rounded-[3px] border border-ink px-4 py-3 text-sm ${visa === v ? "bg-ink text-on-ink" : ""}`}>
                <input type="radio" name="visaType" value={v} checked={visa === v} onChange={() => setVisa(v)} className="sr-only" />
                <span className="font-semibold">{v === "F1" ? "F-1 student" : "B1/B2 visitor"}</span>
              </label>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Age">
              <input name="age" type="number" min={10} max={110} required className={inputCls} />
            </Field>
            <Field label="Status">
              <select name="maritalStatus" className={inputCls}>
                <option value="single">Single</option>
                <option value="married">Married</option>
                <option value="divorced">Divorced</option>
                <option value="widowed">Widowed</option>
              </select>
            </Field>
            <Field label="Children">
              <input name="children" type="number" min={0} defaultValue={0} className={inputCls} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="grid gap-4">
          <legend className="label mb-3 text-muted">02 · {visa === "F1" ? "Your studies" : "Your trip"}</legend>
          {visa === "F1" ? (
            <>
              <Field label="School">
                <input name="school" className={inputCls} placeholder="e.g. Loyola University New Orleans" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="I-20 first-year cost (USD)">
                  <input name="i20Year1CostUsd" type="number" min={0} className={inputCls} />
                </Field>
                <Field label="Scholarship per year (USD)">
                  <input name="scholarshipUsd" type="number" min={0} className={inputCls} placeholder="0 if none" />
                </Field>
              </div>
            </>
          ) : (
            <>
              <Field label="Why you're going">
                <input name="purpose" className={inputCls} placeholder="e.g. my sister's graduation" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="How many days">
                  <input name="durationDays" type="number" min={1} max={365} className={inputCls} />
                </Field>
                <Field label="Who you'll visit">
                  <input name="hostRelationship" className={inputCls} placeholder="e.g. sister" />
                </Field>
              </div>
            </>
          )}
        </fieldset>

        <fieldset className="grid gap-4">
          <legend className="label mb-3 text-muted">03 · Money</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Who pays">
              <input name="sponsorRelationship" className={inputCls} placeholder="self, father, uncle…" />
            </Field>
            <Field label="Their job">
              <input name="sponsorOccupation" className={inputCls} />
            </Field>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="Money in the bank for this">
              <input name="funds" type="number" min={0} className={inputCls} />
            </Field>
            <Field label="In">
              <select name="fundsCurrency" className={inputCls}>
                <option value="GHS">GH₵</option>
                <option value="USD">US$</option>
              </select>
            </Field>
          </div>
          <Field label="Any big deposit in the last 3 months? (same currency)">
            <input name="recentLargeDeposit" type="number" min={0} className={inputCls} placeholder="Leave empty if none" />
          </Field>
        </fieldset>

        <fieldset className="grid gap-4">
          <legend className="label mb-3 text-muted">04 · Ties and history</legend>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="Your employer">
              <input name="employer" className={inputCls} placeholder="Leave empty if not employed" />
            </Field>
            <Field label="Years">
              <input name="yearsEmployed" type="number" min={0} step="0.5" className={`${inputCls} w-24`} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-5 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="ownsBusiness" /> I own a business
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="ownsProperty" /> I own property
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Refused a US visa before? Year">
              <input name="priorRefusalYear" type="number" min={1990} max={2100} className={inputCls} />
            </Field>
            <Field label="Relative in the US">
              <input name="usRelative" className={inputCls} placeholder="e.g. aunt" />
            </Field>
          </div>
          <Field label="Countries you've visited" hint="Comma-separated">
            <input name="countriesVisited" className={inputCls} placeholder="e.g. Togo, UK" />
          </Field>
        </fieldset>

        <Button type="submit">Scan my case</Button>
        {error && (
          <p role="alert" className="text-sm text-refused">
            {error}
          </p>
        )}
        <p className="text-xs text-muted">Runs in your browser. Nothing is sent anywhere until you create an account.</p>
      </form>

      <div id="scan-result" className="min-w-0 scroll-mt-6">
        {!result ? (
          <div className="doc grid min-h-80 place-items-center p-10 text-center">
            <p className="font-voice max-w-sm text-2xl leading-snug text-muted">
              &ldquo;Where&rsquo;s the officer going to press?&rdquo; Answer on the left and find out. No approval odds, ever.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <section className="doc p-6">
              <h2 className="font-display text-2xl uppercase">Where the officer will press</h2>
              <FlagList flags={result.flags} />
            </section>
            <section className="doc p-6">
              <h2 className="font-display text-2xl uppercase">Questions you&rsquo;re likely to get</h2>
              <QuestionList questions={result.questions} />
            </section>
            <section className="rounded-[var(--radius-doc)] border border-ink bg-ink p-6 text-on-ink">
              <p className="font-display text-2xl uppercase">Now say them out loud</p>
              <p className="mt-2 text-sm opacity-80">
                Knowing the questions isn&rsquo;t the hard part. Answering them clearly, with an officer watching, is. Your first
                mock interview is free, and your answers here carry over.
              </p>
              <Link
                href={signedIn ? "/app" : "/signup"}
                className="mt-4 inline-block rounded-[3px] bg-on-ink px-5 py-3 text-sm font-semibold text-ink hover:bg-stamp hover:text-on-ink"
              >
                {signedIn ? "Continue in your account" : "Start with a free mock"}
              </Link>
            </section>
            <section className="doc p-6">
              <h2 className="font-display text-2xl uppercase">What to bring</h2>
              <Checklist items={result.checklist} />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
