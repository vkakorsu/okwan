"use client";

import { useState } from "react";

export type SortValue = string | number | null;

/**
 * An admin table whose columns sort on click (again to reverse). Each row
 * carries plain values to sort by, separate from what's displayed (links,
 * formatted dates). Columns without sort values stay fixed.
 */
export function SortableTable({
  head,
  rows,
  sortValues,
  initial,
  csvName,
}: {
  head: string[];
  rows: React.ReactNode[][];
  /** One array per row, one value per column; null = not sortable in that column. */
  sortValues: SortValue[][];
  initial?: { col: number; dir: "asc" | "desc" };
  /** Offer a CSV download of the sortable columns, as currently sorted. */
  csvName?: string;
}) {
  const [sort, setSort] = useState(initial ?? null);
  const sortable = head.map((_, c) => sortValues.some((r) => r[c] !== null && r[c] !== undefined));
  const order = rows.map((_, i) => i);
  if (sort) {
    const { col, dir } = sort;
    order.sort((a, b) => {
      const x = sortValues[a][col];
      const y = sortValues[b][col];
      // Empty values last, whichever the direction.
      if (x === null || x === undefined) return y === null || y === undefined ? 0 : 1;
      if (y === null || y === undefined) return -1;
      const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" });
      return dir === "asc" ? cmp : -cmp;
    });
  }

  function toggle(col: number) {
    setSort((s) => (s?.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: typeof sortValues[0]?.[col] === "number" ? "desc" : "asc" }));
  }

  function downloadCsv() {
    const cols = head.map((_, c) => c).filter((c) => sortable[c]);
    const cell = (v: SortValue) => {
      const t = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const lines = [cols.map((c) => cell(head[c])).join(","), ...order.map((i) => cols.map((c) => cell(sortValues[i][c])).join(","))];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${csvName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
    {csvName && (
      <div className="mb-2 flex justify-end">
        <button onClick={downloadCsv} className="text-xs text-muted underline underline-offset-2 hover:text-fg">
          Download CSV
        </button>
      </div>
    )}
    <div className="overflow-x-auto rounded-[4px] border border-line">
      <table className="w-full text-left text-sm">
        <thead className="bg-fg/[0.03] text-xs uppercase tracking-wider text-muted">
          <tr>
            {head.map((h, c) => {
              const active = sort?.col === c;
              return (
                <th
                  key={`${h}-${c}`}
                  scope="col"
                  className="px-4 py-3 font-medium"
                  aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : sortable[c] ? "none" : undefined}
                >
                  {sortable[c] ? (
                    <button onClick={() => toggle(c)} className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-fg ${active ? "text-fg" : ""}`}>
                      {h}
                      <span aria-hidden className="text-[10px]">
                        {active ? (sort!.dir === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  ) : (
                    h
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {order.map((i) => (
            <tr key={i}>
              {rows[i].map((c, j) => (
                <td key={j} className="px-4 py-3 align-top tabular">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </div>
  );
}
