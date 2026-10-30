"use client";

import { exportTableToExcel } from "@/lib/reports/export";
import { printTablePdf } from "@/lib/export/tableExport";

/** Excel download or a printable PDF of a list that is shown on the page in another layout (plain data only crosses from the server). */
export function ExportListButtons({ filenameBase, headers, rows, moneyColumns = [] }: { filenameBase: string; headers: string[]; rows: (string | number)[][]; /** headers of the RM columns: shown with 2 decimal places (3000.00) in Excel and in the print */ moneyColumns?: string[] }) {
  const btn = "rounded-lg border border-border-strong bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-text disabled:opacity-50";
  const title = filenameBase.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase());
  return (
    <div className="flex gap-2 print:hidden">
      <button type="button" disabled={rows.length === 0} onClick={() => exportTableToExcel(filenameBase, headers, rows, moneyColumns)} className={btn}>
        Export Excel
      </button>
      <button
        type="button"
        disabled={rows.length === 0}
        // the window is opened by the click itself so that a pop-up blocker lets it through
        onClick={() => printTablePdf({ title, subtitle: `${rows.length} row${rows.length === 1 ? "" : "s"}`, columns: headers, rows: rows.map((r) => r.map((cell, i) => (typeof cell === "number" && moneyColumns.includes(headers[i]) ? cell.toFixed(2) : String(cell)))), landscape: headers.length > 5 }, window.open("", "_blank"))}
        className={btn}
      >
        Print
      </button>
    </div>
  );
}
