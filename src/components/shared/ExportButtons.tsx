"use client";

import { useState } from "react";
import { downloadTableExcel, printTablePdf, type ExportTable } from "@/lib/export/tableExport";

const buttonClass = "h-9 rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-text hover:bg-surface-alt disabled:opacity-50";

/** "Export Excel" and "Print" for a list: the table is built from what the page shows. */
export function ExportButtons({ table }: { table: ExportTable }) {
  const [busy, setBusy] = useState(false);
  const empty = table.rows.length === 0;

  async function excel() {
    setBusy(true);
    try {
      await downloadTableExcel(table);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2">
      <button type="button" disabled={empty || busy} onClick={excel} className={buttonClass}>
        Export Excel
      </button>
      <button
        type="button"
        disabled={empty}
        // the window is opened by the click itself so that a pop-up blocker lets it through
        onClick={() => printTablePdf(table, window.open("", "_blank"))}
        className={buttonClass}
      >
        Print
      </button>
    </div>
  );
}
