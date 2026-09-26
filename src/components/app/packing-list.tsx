"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { ChecklistGroup, ChecklistItem } from "@/lib/domain/checklist";

const GROUP_NOTE: Record<ChecklistGroup, string> = {
  Required: "Without these you may not get to the window.",
  "Likely to be asked for": "Have them in order, on top.",
  "Good to have": "In the folder, in case.",
};

/**
 * What to bring, as a packing list. A tick means "the original is in my
 * folder", which only the applicant knows. "Uploaded" is separate: a
 * practice copy isn't the paper, so uploading never ticks an item and
 * unticking never touches an upload.
 */
export function PackingList({
  items,
  uploaded,
  packed,
  setPacked,
}: {
  items: ChecklistItem[];
  uploaded: readonly string[];
  packed: readonly string[];
  setPacked: (itemId: string, isPacked: boolean) => Promise<void>;
}) {
  const [optimistic, toggle] = useOptimistic(new Set(packed), (state: Set<string>, id: string) => {
    const next = new Set(state);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const [, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const groups = [...new Set(items.map((i) => i.group))];
  const required = items.filter((i) => i.group === "Required");
  const requiredPacked = required.filter((i) => optimistic.has(i.id)).length;

  return (
    <div className="mt-4 space-y-6">
      <p className="text-sm">
        <strong className="tabular">
          {items.filter((i) => optimistic.has(i.id)).length} of {items.length}
        </strong>{" "}
        in your folder
        {requiredPacked < required.length && (
          <span className="text-refused"> · {required.length - requiredPacked} required still to pack</span>
        )}
      </p>
      {failed && (
        <p role="alert" className="text-sm text-refused">
          Couldn&rsquo;t save that tick. Check your connection and try again.
        </p>
      )}
      {groups.map((g) => (
        <div key={g}>
          <p className="label text-fg">{g}</p>
          <p className="mt-0.5 text-xs text-muted">{GROUP_NOTE[g]}</p>
          <ul className="mt-2 divide-y divide-line">
            {items
              .filter((i) => i.group === g)
              .map((i) => {
                const isPacked = optimistic.has(i.id);
                const hasUpload = Boolean(i.docKind && uploaded.includes(i.docKind));
                return (
                  <li key={i.id}>
                    <label className="flex cursor-pointer gap-3 py-2.5 text-sm">
                      <input
                        type="checkbox"
                        checked={isPacked}
                        onChange={() =>
                          startTransition(async () => {
                            toggle(i.id);
                            setFailed(false);
                            // If saving fails, the tick springs back (the optimistic state ends) and we say so.
                            await setPacked(i.id, !isPacked).catch(() => setFailed(true));
                          })
                        }
                        className="mt-0.5 size-4 shrink-0 accent-[var(--stamp)]"
                      />
                      <span className="min-w-0">
                        <span className={`block ${isPacked ? "text-muted line-through" : ""}`}>
                          {i.label}
                          {hasUpload && <span className="label ml-2 text-stamp no-underline">Uploaded</span>}
                        </span>
                        <span className="block text-xs text-muted">{i.why}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
      <p className="text-xs text-muted">
        Tick an item once the original is in your folder. Uploading a copy here doesn&rsquo;t count: bring the paper.
        Officers rarely look at supporting documents, so don&rsquo;t hand anything over unless you&rsquo;re asked.
      </p>
    </div>
  );
}
