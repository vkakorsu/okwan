import Link from "next/link";
import { Logo } from "@/components/logo";
import { packLabel } from "@/lib/labels";

export interface TopBarCredits {
  plan: string | null;
  interviews: number;
  drills: number;
  /** The free mock and free drills still unused (everyone gets 1 and 3). */
  freeInterviews: number;
  freeDrills: number;
  buyHref: string;
}

/** The app's top bar: logo, what's left to use, Home and Sign out. */
export function TopBar({ credits }: { credits: TopBarCredits }) {
  // Paid credits are used first; with none left, the free allowance is what's usable.
  const interviews = credits.interviews || credits.freeInterviews;
  const drills = credits.drills || credits.freeDrills;
  const freeInterviews = !credits.interviews && credits.freeInterviews > 0;
  const freeDrills = !credits.drills && credits.freeDrills > 0;
  const hasCredits = credits.interviews > 0 || credits.drills > 0;
  return (
    <header className="sticky top-0 z-30 border-b print:hidden border-ink bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/app" aria-label="Home" className="shrink-0">
          <Logo />
        </Link>
        <div className="flex items-center gap-2 text-sm">
          {/* What's left to use, like a ticket stub: the pack, the balance, and more. */}
          <Link
            href={credits.buyHref}
            title="Interviews and drills left"
            className="group flex h-9 items-stretch overflow-hidden rounded-[3px] border border-ink"
          >
            <span className="label hidden items-center bg-ink px-2.5 text-on-ink sm:flex">
              {credits.plan ? packLabel(credits.plan) : "Free"}
            </span>
            <span className="flex items-center gap-1.5 px-3 tabular">
              <strong>{interviews}</strong>
              <span className="text-muted">
                <span className="sm:hidden">{freeInterviews ? "free" : "left"}</span>
                <span className="hidden sm:inline">
                  {freeInterviews ? "free " : ""}interview{interviews === 1 ? "" : "s"}
                </span>
              </span>
              <span className="hidden text-muted sm:inline">·</span>
              <strong className="hidden sm:inline">{drills}</strong>
              <span className="hidden text-muted sm:inline">
                {freeDrills ? "free " : ""}drill{drills === 1 ? "" : "s"}
              </span>
            </span>
            <span className="hidden items-center border-l border-ink px-3 font-semibold text-stamp group-hover:bg-stamp group-hover:text-on-ink md:flex">
              {hasCredits ? "Get more" : "Get interviews"}
            </span>
          </Link>
          <Link href="/app" className="flex h-9 items-center rounded-[3px] border border-ink px-3 font-semibold hover:bg-ink hover:text-on-ink">
            Home
          </Link>
          <form action="/auth/signout" method="post">
            <button className="h-9 rounded-[3px] border border-line px-3 text-muted hover:border-ink hover:text-fg">Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
