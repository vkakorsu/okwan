"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { SocialItem } from "@/lib/domain/social-check";

/** Tick each item once you've checked it on your own profiles. Saved to your case. */
export function SocialChecklist({
  items,
  checked,
  setChecked,
}: {
  items: SocialItem[];
  checked: readonly string[];
  setChecked: (itemId: string, done: boolean) => Promise<void>;
}) {
  const [optimistic, toggle] = useOptimistic(new Set(checked), (state: Set<string>, id: string) => {
    const next = new Set(state);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const [, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const done = items.filter((i) => optimistic.has(i.id)).length;

  return (
    <div className="text-sm">
      <p>
        <strong className="tabular">
          {done} of {items.length}
        </strong>{" "}
        checked
      </p>
      {failed && (
        <p role="alert" className="mt-1 text-refused">
          Couldn&rsquo;t save that tick. Check your connection and try again.
        </p>
      )}
      <ul className="mt-3 divide-y divide-line">
        {items.map((i) => {
          const isDone = optimistic.has(i.id);
          return (
            <li key={i.id}>
              <label className="flex cursor-pointer gap-3 py-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={isDone}
                  onChange={() =>
                    startTransition(async () => {
                      toggle(i.id);
                      setFailed(false);
                      try {
                        await setChecked(i.id, !isDone);
                      } catch {
                        setFailed(true);
                      }
                    })
                  }
                />
                <span>
                  <span className={`block font-semibold ${isDone ? "text-muted line-through" : ""}`}>{i.title}</span>
                  <span className="mt-0.5 block text-muted">{i.detail}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
