"use client";

import { exportTableToExcel } from "@/lib/reports/export";

/**
 * Server Components can pass plain data and already-rendered JSX to a Client
 * Component, but never a function — so a report page never hands this table
 * a `value(row)`/`render(row)` callback. It computes each cell's plain export
 * value and (optionally) its prettier on-screen node itself (via
 * `buildReportRows` in lib/reports/buildRows.ts) and only the result — plain
 * strings/numbers and ReactNode — crosses the boundary.
 */
export type ReportCell = { key: string; exportValue: string | number; display?: React.ReactNode };
export type ReportRow = { rowKey: string; cells: ReportCell[] };

export function ReportTable({
  headers,
  rows,
  filenameBase,
  emptyText = "No data for this filter.",
}: {
  headers: string[];
  rows: ReportRow[];
  filenameBase: string;
  emptyText?: string;
}) {
  const exportRows = rows.map((r) => r.cells.map((c) => c.exportValue));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end gap-2 print:hidden">
        <button
          onClick={() => exportTableToExcel(filenameBase, headers, exportRows)}
          disabled={rows.length === 0}
          className="rounded-lg border border-border-strong bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-text disabled:opacity-50"
        >
          Export Excel
        </button>
        <button
          onClick={() => window.print()}
          disabled={rows.length === 0}
          className="rounded-lg border border-border-strong bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-text disabled:opacity-50"
        >
          Print
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm print:border-0 print:shadow-none">
        {rows.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-text-muted">{emptyText}</div>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead className="bg-surface-alt">
              <tr className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
                {headers.map((h) => (
                  <th key={h} className="px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.rowKey} className="border-t border-border text-[13px]">
                  {row.cells.map((c) => (
                    <td key={c.key} className="px-4 py-2.5 text-text-secondary">
                      {c.display ?? c.exportValue}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
