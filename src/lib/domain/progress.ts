import type { AnswerQuality, PastSession } from "./director";
import { readiness, type ReadinessTopic, type TopicStatus } from "./readiness";

/**
 * Progress over time: readiness as it stood after each session, and each
 * topic's answers session by session. Replays the same readiness model
 * (src/lib/domain/readiness.ts), so the chart and the headline number agree.
 */

export interface ProgressPoint {
  sessionId: string;
  at: string;
  /** 0..1, readiness just after this session. */
  score: number;
  mode: string;
  officer: string;
  tough: boolean;
  outcome: string | null;
}

export interface TopicRow {
  id: string;
  critical: boolean;
  status: TopicStatus;
  /** One entry per session column (oldest first): the answer's quality, or null if not asked. */
  cells: (AnswerQuality | null)[];
}

export interface Progress {
  points: ProgressPoint[];
  /** Session columns for the topic grid, oldest first (the most recent `columns`). */
  columns: ProgressPoint[];
  topics: TopicRow[];
}

/** `sessions` newest first, as pastSessions returns them; only sessions with a time are charted. */
export function progress(sessions: readonly PastSession[], topics: readonly ReadinessTopic[], opts: { now?: number; columns?: number } = {}): Progress {
  const oldestFirst = sessions.filter((s) => s.at).slice().reverse();
  const points: ProgressPoint[] = oldestFirst.map((s, i) => {
    // Readiness as it stood right after this session: that session and every one before it.
    const upTo = oldestFirst.slice(0, i + 1).reverse();
    const at = Date.parse(s.at!);
    return {
      sessionId: s.id ?? `s${i}`,
      at: s.at!,
      score: readiness(upTo, topics, at + 60_000).score,
      mode: s.mode ?? "real",
      officer: s.officer.name,
      tough: s.mode === "dress_rehearsal" || s.officer.traits.scepticism >= 0.6,
      outcome: s.outcome ?? null,
    };
  });
  const cols = Math.max(1, opts.columns ?? 14);
  const columnSessions = oldestFirst.slice(-cols);
  const current = readiness(sessions, topics, opts.now);
  const rows: TopicRow[] = current.topics
    .map((t) => ({
      id: t.id,
      critical: t.critical,
      status: t.status,
      cells: columnSessions.map((s) => {
        const results = s.probeResults.filter((r) => r.probeId === t.id);
        if (!results.length) return null;
        return results.some((r) => r.quality === "contradiction") ? "contradiction" : results[results.length - 1].quality;
      }),
    }))
    // Key topics first, then the ones with most history.
    .sort((a, b) => Number(b.critical) - Number(a.critical) || b.cells.filter(Boolean).length - a.cells.filter(Boolean).length);
  return { points, columns: points.slice(-cols), topics: rows };
}
