"use client";

import { splitAddsUp, type SplitCell } from "@/lib/categorySplit";

const inputClass = "mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px] outline-none focus:border-primary";
const labelClass = "text-[12px] font-semibold text-text-secondary";

/**
 * How much of the amount belongs to each category (and to each company, for a staff claim for more than one company). The amount is
 * shared equally until a part is typed; each part is saved as its own record.
 */
export function SplitAmountBox({
  title,
  total,
  cells,
  companies = [],
  onType,
  onEqual,
}: {
  title: string;
  total: string;
  cells: SplitCell[];
  /** the companies of the columns (none: one column) */
  companies?: { id: string; name: string }[];
  onType: (key: string, text: string) => void;
  onEqual: () => void;
}) {
  const categories = Array.from(new Set(cells.map((c) => c.category)));
  const cols = companies.length > 0 ? companies : [{ id: "", name: "" }];
  const sumCents = cells.reduce((t, c) => t + Math.round(c.amount * 100), 0);
  const ok = splitAddsUp(total, cells);
  return (
    <div className="rounded-lg border border-border bg-surface-alt p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={labelClass}>{title}</div>
        <button type="button" onClick={onEqual} className="text-[12px] font-semibold text-primary">
          Share equally
        </button>
      </div>
      <div className="mt-0.5 text-[11.5px] text-text-muted">Type the amount of a part; the parts left as they are share what is left of the total.</div>
      <div className="mt-2 flex flex-col gap-2">
        {categories.map((category) => (
          <div key={category || "-"} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {cols.map((co) => {
              const cell = cells.find((c) => c.category === category && c.companyId === co.id);
              if (!cell) return null;
              const label = [category, co.name].filter(Boolean).join(" · ");
              return (
                <div key={cell.key}>
                  <label className={labelClass}>{label}</label>
                  <input type="number" min="0.01" step="0.01" value={cell.text} onChange={(e) => onType(cell.key, e.target.value)} className={inputClass} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className={`mt-2 text-[12px] font-semibold ${ok ? "text-success" : "text-danger"}`}>{`Total of the parts: RM ${(sumCents / 100).toFixed(2)} of RM ${Number(total || 0).toFixed(2)}`}</div>
    </div>
  );
}
