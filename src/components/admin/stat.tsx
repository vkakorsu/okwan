import { SortableTable, type SortValue } from "./sortable-table";

export function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="doc p-5">
      <p className="text-xs uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="font-display mt-2 text-4xl tabular">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl uppercase">{title}</h2>
      {note && <p className="mt-1 max-w-3xl text-sm text-muted">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Table({
  head,
  rows,
  empty = "Nothing yet.",
  sortValues,
  initialSort,
}: {
  head: string[];
  rows: React.ReactNode[][];
  empty?: string;
  /** Plain values to sort each column by (null where a column shouldn't sort). Makes the table sortable. */
  sortValues?: SortValue[][];
  initialSort?: { col: number; dir: "asc" | "desc" };
}) {
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  if (sortValues) return <SortableTable head={head} rows={rows} sortValues={sortValues} initial={initialSort} />;
  return (
    <div className="overflow-x-auto rounded-[4px] border border-line">
      <table className="w-full text-left text-sm">
        <thead className="bg-fg/[0.03] text-xs uppercase tracking-wider text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="px-4 py-3 align-top tabular">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PageHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div>
      <h1 className="font-display text-[clamp(2.2rem,4vw,3.2rem)]">{title}</h1>
      {children && <p className="mt-2 max-w-3xl text-muted">{children}</p>}
    </div>
  );
}
