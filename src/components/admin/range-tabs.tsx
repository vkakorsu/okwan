import Link from "next/link";
import { RANGES, type Range } from "@/lib/server/admin";

/** One row of range links above everything it scopes. */
export function RangeTabs({ path, range }: { path: string; range: Range }) {
  return (
    <nav aria-label="Date range" className="mt-6 flex flex-wrap gap-1 text-sm">
      {RANGES.map((r) => (
        <Link
          key={r}
          href={`${path}?days=${r}`}
          aria-current={r === range ? "page" : undefined}
          className={`rounded-[3px] border px-3 py-1 ${r === range ? "border-ink bg-ink text-on-ink" : "border-line text-muted hover:border-ink hover:text-fg"}`}
        >
          {r === "all" ? "All time" : `${r} days`}
        </Link>
      ))}
    </nav>
  );
}
