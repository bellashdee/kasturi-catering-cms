"use client";

import { exportTableToCsv, exportTableToExcel } from "@/lib/reports/export";

/** Excel / CSV download of a list that is shown on the page in another layout (plain data only crosses from the server). */
export function ExportListButtons({ filenameBase, headers, rows }: { filenameBase: string; headers: string[]; rows: (string | number)[][] }) {
  const btn = "rounded-lg border border-border-strong bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-text disabled:opacity-50";
  return (
    <div className="flex gap-2 print:hidden">
      <button type="button" disabled={rows.length === 0} onClick={() => exportTableToExcel(filenameBase, headers, rows)} className={btn}>
        Export Excel
      </button>
      <button type="button" disabled={rows.length === 0} onClick={() => exportTableToCsv(filenameBase, headers, rows)} className={btn}>
        Export CSV
      </button>
    </div>
  );
}
