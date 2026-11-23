"use client";

import { useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";
import type { TotalPart } from "@/lib/origin/kinds";

export type { TotalPart };
import { Dialog } from "@/components/priority/ui";
import { AmountOrigin } from "@/components/shared/AmountOrigin";

const MAX_ROWS = 300;

/**
 * A total that shows what it is made of. Tapping it opens a box with the total split by where each part comes from (how many records,
 * how many of them have a bill), then every record, each with its own <AmountOrigin> (tap = open the bill). When the total is worked
 * out (not a sum of records), `explain` says how.
 */
export function TotalOrigin({
  total,
  parts,
  title,
  explain,
  text,
  className,
}: {
  total: number;
  parts: TotalPart[];
  title: string;
  /** how the total is worked out, in one or two sentences (shown at the top of the box) */
  explain?: string;
  /** what is shown instead of the RM total */
  text?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => {
    const m = new Map<string, { amount: number; count: number; withBill: number }>();
    for (const p of parts) {
      const g = m.get(p.group) ?? { amount: 0, count: 0, withBill: 0 };
      g.amount += p.amount;
      g.count += 1;
      if (p.billIds && p.billIds.length > 0) g.withBill += 1;
      m.set(p.group, g);
    }
    return Array.from(m.entries()).sort((a, b) => Math.abs(b[1].amount) - Math.abs(a[1].amount));
  }, [parts]);
  const sorted = useMemo(() => [...parts].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.amount - a.amount), [parts]);
  const sum = parts.reduce((t, p) => t + p.amount, 0);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Where does this total come from?" className={`${className ?? ""} cursor-pointer underline decoration-dotted underline-offset-4 hover:text-primary`}>
        {text ?? formatCurrency(total)}
      </button>
      {open && (
        <Dialog title={`Where does this come from? · ${title}`} onClose={() => setOpen(false)} wide>
          <div className="flex flex-col gap-4 text-[13.5px]">
            <div>
              <div className="text-[24px] font-extrabold text-text">{formatCurrency(total)}</div>
              {explain && <p className="mt-1 text-text-secondary">{explain}</p>}
              {parts.length > 0 && Math.abs(sum - total) > 0.005 && (
                <p className="mt-1 text-warning">The records below add up to {formatCurrency(sum)}; the difference is worked out as explained above.</p>
              )}
            </div>

            {parts.length === 0 ? (
              <div className="rounded-lg bg-surface-alt px-3 py-2 text-text-secondary">No record is counted in this total.</div>
            ) : (
              <>
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
                      <th className="py-1.5 pr-3">From</th>
                      <th className="py-1.5 pr-3 text-right">Records</th>
                      <th className="py-1.5 pr-3 text-right">With a bill</th>
                      <th className="py-1.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(([g, v]) => (
                      <tr key={g} className="border-t border-border">
                        <td className="py-1.5 pr-3 font-semibold text-text">{g}</td>
                        <td className="py-1.5 pr-3 text-right">{v.count}</td>
                        <td className={`py-1.5 pr-3 text-right ${v.withBill < v.count ? "text-warning" : "text-success"}`}>{v.withBill} / {v.count}</td>
                        <td className="py-1.5 text-right font-semibold">{formatCurrency(v.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div>
                  <div className="mb-1 text-[12px] font-bold uppercase tracking-wide text-text-muted">Every record (tap an amount to open its bill)</div>
                  <ul className="flex max-h-[50vh] flex-col overflow-y-auto rounded-lg border border-border">
                    {sorted.slice(0, MAX_ROWS).map((p, i) => (
                      <li key={`${p.origin?.kind ?? p.group}-${p.origin?.id ?? i}`} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-3 py-1.5 last:border-b-0">
                        <span className="text-text-muted">{p.date ?? "—"}</span>
                        <span className="min-w-0 truncate text-text-secondary">
                          <span className="font-semibold text-text">{p.group}</span>
                          {p.label ? ` · ${p.label}` : ""}
                        </span>
                        <span className="text-right font-semibold">
                          <AmountOrigin origin={p.origin} amount={p.amount} billIds={p.billIds} />
                        </span>
                      </li>
                    ))}
                  </ul>
                  {sorted.length > MAX_ROWS && <p className="mt-1 text-[12px] text-text-muted">The first {MAX_ROWS} of {sorted.length} records are listed. Use the page&apos;s filters to see the others.</p>}
                </div>
              </>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
