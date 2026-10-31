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
  // a column of numbers (amounts, pax, counts) is lined up on the right
  const numeric = headers.map((_, i) => rows.length > 0 && rows.every((r) => typeof r.cells[i]?.exportValue === "number"));

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

      {rows.length > 0 && <p className="text-[12px] text-text-secondary print:hidden">{rows.length} row{rows.length === 1 ? "" : "s"} · scroll sideways to see every column</p>}

      <div className="max-h-[75vh] overflow-auto rounded-xl border border-border bg-surface shadow-sm print:max-h-none print:overflow-visible print:border-0 print:shadow-none">
        {rows.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-text-muted">{emptyText}</div>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-surface-alt">
              <tr className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
                {headers.map((h, i) => (
                  <th key={`${h}-${i}`} className={`whitespace-nowrap border-b border-border px-3 py-2.5 ${numeric[i] ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.rowKey} className="border-t border-border text-[13px] even:bg-surface-alt/40 hover:bg-info-bg/40">
                  {row.cells.map((c, i) => {
                    const v = c.exportValue;
                    const text = typeof v === "string" ? v : "";
                    const long = !c.display && text.length > 70;
                    // numbers line up on the right and never wrap; short text stays on one line; long text (remarks) wraps in a fixed width, cut after three lines
                    const cls = numeric[i]
                      ? "whitespace-nowrap text-right tabular-nums"
                      : long
                        ? "min-w-[16rem] max-w-[26rem]"
                        : c.display || text.length > 24
                          ? "min-w-[9rem]"
                          : "whitespace-nowrap";
                    return (
                      <td key={c.key} className={`px-3 py-2.5 align-top text-text-secondary ${cls}`}>
                        {long ? <span className="line-clamp-3 print:line-clamp-none" title={text}>{text}</span> : c.display ?? v}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
