import type { Balance } from "./credits";

/**
 * Can this case start a session right now, and what kind? Pure so it's
 * testable; the server loads the rows and calls this. Paid sessions spend
 * credits (credits.ts); the free mock and free drills are per account.
 */

export type Entitlement =
  | { kind: "full"; reason: string }
  | { kind: "free"; reason: string }
  | { kind: "none"; reason: string };

/**
 * The free mock runs like any interview (the officer decides when they've
 * heard enough), within a hidden ceiling that bounds its cost. Never shown
 * to users: a real interview has no advertised length.
 */
export const FREE_MOCK_MAX_SECONDS = 180;
export const FREE_MOCK_MAX_TOPICS = 3;
/** One-question drills: a few free to show the value. */
export const FREE_DRILLS_PER_ACCOUNT = 3;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** freeBlocked: why this account can't have a free session right now (src/lib/server/repo.ts), if so. */
export function entitlement(input: { credits: Balance; freeSessionsUsed: number; freeBlocked?: string | null }): Entitlement {
  if (input.credits.interviews > 0) return { kind: "full", reason: `${plural(input.credits.interviews, "interview")} left` };
  if (input.freeSessionsUsed === 0 && input.freeBlocked) return { kind: "none", reason: input.freeBlocked };
  if (input.freeSessionsUsed === 0) return { kind: "free", reason: "Your free mock interview" };
  return { kind: "none", reason: "You've used your interviews. Get more to keep practising." };
}

export function drillEntitlement(input: { credits: Balance; freeDrillsUsed: number; freeBlocked?: string | null }): Entitlement {
  if (input.credits.drills > 0) return { kind: "full", reason: `${plural(input.credits.drills, "drill")} left` };
  const left = FREE_DRILLS_PER_ACCOUNT - input.freeDrillsUsed;
  if (left > 0 && input.freeBlocked) return { kind: "none", reason: input.freeBlocked };
  return left > 0
    ? { kind: "free", reason: `${plural(left, "free drill")} left` }
    : { kind: "none", reason: "You've used your drills. Get more to keep practising." };
}
