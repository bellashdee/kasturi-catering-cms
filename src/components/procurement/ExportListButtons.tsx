"use client";

import { exportTableToExcel } from "@/lib/reports/export";
import { groupColumnsForPrint, printTablePdf, type PrintColumnGroup } from "@/lib/export/tableExport";

const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Excel download or a printable PDF of a list that is shown on the page in another layout (plain data only crosses from the server). */
export function ExportListButtons({
  filenameBase,
  headers,
  rows,
  moneyColumns = [],
  summary = [],
  title: titleText,
  info = [],
  signatures = [],
  printGroups = [],
}: {
  filenameBase: string;
  headers: string[];
  rows: (string | number)[][];
  /** headers of the RM columns: shown with 2 decimal places (3000.00) in Excel and in the print */
  moneyColumns?: string[];
  /** under the list in the print and in Excel: e.g. the total spent and the spending of each company */
  summary?: { label: string; value: string; bold?: boolean }[];
  /** the heading of the print and of the Excel sheet (otherwise made from the file name) */
  title?: string;
  /** lines above the list in the print and in Excel: e.g. the staff member's name, the company, the period and the totals */
  info?: { label: string; value: string }[];
  /** sign-off boxes at the end of the print and of the Excel sheet (e.g. the staff member, Checked by, Approved by) */
  signatures?: { label: string; name?: string }[];
  /** small related columns shown together in one column of the print only, so that a wide list stays readable (Excel keeps every column) */
  printGroups?: PrintColumnGroup[];
}) {
  const btn = "rounded-lg border border-border-strong bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-text disabled:opacity-50";
  const title = titleText ?? filenameBase.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase());
  const hasExtra = !!titleText || info.length > 0 || signatures.length > 0;
  function print() {
    // the window is opened by the click itself so that a pop-up blocker lets it through
    const target = window.open("", "_blank");
    const text = rows.map((r) => r.map((cell, i) => (typeof cell === "number" && moneyColumns.includes(headers[i]) ? money(cell) : String(cell))));
    const table = groupColumnsForPrint(headers, text, printGroups);
    printTablePdf({ title, subtitle: `${rows.length} row${rows.length === 1 ? "" : "s"}`, ...table, moneyColumns, landscape: table.columns.length > 6, summary, info, signatures }, target);
  }
  return (
    <div className="flex gap-2 print:hidden">
      <button
        type="button"
        disabled={rows.length === 0}
        onClick={() => exportTableToExcel(filenameBase, headers, rows, moneyColumns, summary, hasExtra ? { title, info, signatures } : {})}
        className={btn}
      >
        Export Excel
      </button>
      <button
        type="button"
        disabled={rows.length === 0}
        onClick={print}
        className={btn}
      >
        Print
      </button>
    </div>
  );
}
