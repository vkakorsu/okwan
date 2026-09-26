"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ProgressPoint } from "@/lib/domain/progress";
import { formatDate, modeLabel, outcomeLabel } from "@/lib/labels";

/**
 * Readiness after each session: one series, so no legend (the heading names
 * it). 2px line, a faint wash, an end dot with its value, recessive grid, a
 * crosshair that snaps to the nearest session, and the same data as a table.
 */
const H = 220;
const PAD = { top: 16, right: 44, bottom: 28, left: 36 };

export function ReadinessChart({ points }: { points: ProgressPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  // Drawn at the container's real width, so text stays at its real size on any screen.
  const [W, setW] = useState(320);
  const box = useRef<HTMLDivElement | null>(null);
  const svg = useRef<SVGSVGElement | null>(null);
  const titleId = useId();
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(280, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (!points.length) return <p className="text-sm text-muted">Your readiness appears here after your first interview.</p>;

  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => PAD.top + (1 - v) * ih;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const last = points.length - 1;
  const shown = active ?? null;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return;
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    points.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    });
    setActive(best);
  }

  function onKey(e: React.KeyboardEvent<SVGSVGElement>) {
    if (e.key === "ArrowRight") setActive((a) => Math.min(last, (a ?? -1) + 1));
    if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? last + 1) - 1));
    if (e.key === "Escape") setActive(null);
  }

  const tip = shown !== null ? points[shown] : null;
  const tipLeft = shown !== null ? (x(shown) / W) * 100 : 0;

  return (
    <div>
      <div className="relative w-full min-w-0 overflow-hidden" ref={box}>
        <svg
          ref={svg}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-stamp"
          role="img"
          aria-labelledby={titleId}
          tabIndex={0}
          onPointerMove={onMove}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(last)}
          onBlur={() => setActive(null)}
          onKeyDown={onKey}
        >
          <title id={titleId}>
            {`Readiness after each of ${points.length} sessions, now ${Math.round(points[last].score * 100)}%. Use the arrow keys to step through sessions.`}
          </title>
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="stroke-line" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular">
                {v * 100}%
              </text>
            </g>
          ))}
          <text x={PAD.left + 4} y={y(0.9) - 5} className="fill-muted text-[10px]">
            90%: well prepared
          </text>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(0.9)} y2={y(0.9)} className="stroke-muted" strokeWidth={1} strokeOpacity={0.5} />
          <path d={area} className="fill-stamp" fillOpacity={0.1} />
          <path d={line} fill="none" className="stroke-stamp" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {shown !== null && <line x1={x(shown)} x2={x(shown)} y1={PAD.top} y2={y(0)} className="stroke-muted" strokeWidth={1} />}
          {points.map((p, i) =>
            i === last || i === shown ? (
              <circle key={p.sessionId} cx={x(i)} cy={y(p.score)} r={4.5} className="fill-stamp stroke-paper" strokeWidth={2} />
            ) : null,
          )}
          <text x={x(last) + 8} y={y(points[last].score)} dy="0.32em" className="fill-fg text-[12px] font-semibold tabular">
            {Math.round(points[last].score * 100)}%
          </text>
          <text x={PAD.left} y={H - 8} className="fill-muted text-[11px]">
            {formatDate(points[0].at)}
          </text>
          {points.length > 1 && (
            <text x={W - PAD.right} y={H - 8} textAnchor="end" className="fill-muted text-[11px]">
              {formatDate(points[last].at)}
            </text>
          )}
        </svg>
        {tip && (
          <div
            className="pointer-events-none absolute top-0 z-10 w-max max-w-[14rem] -translate-x-1/2 border border-ink bg-paper px-3 py-2 text-xs shadow-sm"
            style={{ left: `${Math.min(85, Math.max(15, tipLeft))}%` }}
            role="status"
          >
            <p className="text-base font-semibold tabular">{Math.round(tip.score * 100)}%</p>
            <p className="text-muted">
              {formatDate(tip.at)} · {modeLabel(tip.mode)}
            </p>
            <p className="text-muted">
              {tip.officer}
              {tip.tough ? " (tough)" : ""}
              {tip.outcome ? ` · ${outcomeLabel(tip.outcome)}` : ""}
            </p>
          </div>
        )}
      </div>
      <details className="mt-3 text-sm">
        <summary className="label cursor-pointer text-muted">Show as a table</summary>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-muted">
              <th className="py-1 font-normal">Date</th>
              <th className="py-1 font-normal">Session</th>
              <th className="py-1 font-normal">Officer</th>
              <th className="py-1 text-right font-normal">Readiness</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.sessionId} className="border-b border-line">
                <td className="py-1">{formatDate(p.at)}</td>
                <td className="py-1">
                  {modeLabel(p.mode)}
                  {p.outcome ? ` · ${outcomeLabel(p.outcome)}` : ""}
                </td>
                <td className="py-1">
                  {p.officer}
                  {p.tough ? " (tough)" : ""}
                </td>
                <td className="py-1 text-right tabular">{Math.round(p.score * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
