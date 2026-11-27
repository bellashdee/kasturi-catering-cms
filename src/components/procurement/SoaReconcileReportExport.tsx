"use client";

import { useState } from "react";
import { buildTablePdf } from "@/lib/export/tableExport";

export type ReconReportData = {
  title: string;
  filename: string;
  info: { label: string; value: string }[];
  balances: string[][];
  causes: { label: string; amount: number }[];
  unexplained: number;
  lines: string[][];
};

const BAL_COLUMNS = ["", "Supplier's SOA (RM)", "Our records (RM)", "Difference (RM)"];
const LINE_COLUMNS = ["Source", "Date", "Type", "Reference", "Amount (RM)", "Status", "Our record", "Likely cause / resolution"];
const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const buttonClass = "h-9 rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-text hover:bg-surface-alt disabled:opacity-50";

/** The reconciliation report: supplier, company, period, both closing balances, the difference and its causes, every line with its status. */
export function SoaReconcileReportExport({ data }: { data: ReconReportData }) {
  const [busy, setBusy] = useState(false);

  async function excel() {
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.utils.book_new();
      const summary = [
        [data.title],
        [],
        ...data.info.map((i) => [i.label, i.value]),
        [],
        BAL_COLUMNS,
        ...data.balances,
        [],
        ["Likely causes of the difference", "Amount (RM)"],
        ...data.causes.map((c) => [c.label, money(c.amount)]),
        ["Not explained", money(data.unexplained)],
      ];
      const s1 = XLSX.utils.aoa_to_sheet(summary);
      s1["!cols"] = [{ wch: 48 }, { wch: 24 }, { wch: 20 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(book, s1, "Reconciliation");
      const s2 = XLSX.utils.aoa_to_sheet([LINE_COLUMNS, ...data.lines]);
      s2["!cols"] = LINE_COLUMNS.map((c, i) => ({ wch: Math.min(60, Math.max(c.length, ...data.lines.map((r) => (r[i] ?? "").length)) + 2) }));
      XLSX.utils.book_append_sheet(book, s2, "Lines");
      XLSX.writeFile(book, `${data.filename}.xlsx`);
    } finally {
      setBusy(false);
    }
  }

  function pdf() {
    const rows: string[][] = [
      ...data.balances.map((b) => ["Balance", "", b[0], "", b[1], `ours ${b[2]}`, `difference ${b[3]}`, ""]),
      ...data.causes.map((c) => ["Cause", "", c.label, "", money(c.amount), "", "", ""]),
      ["Cause", "", "Not explained", "", money(data.unexplained), "", "", ""],
      ...data.lines,
    ];
    buildTablePdf({ title: data.title, subtitle: "Supplier SOA Reconciliation Report", columns: LINE_COLUMNS, rows, landscape: true, info: data.info, signatures: [{ label: "Reconciled by" }, { label: "Verified by" }, { label: "Approved for payment (Finance)" }] }).save(`${data.filename}.pdf`);
  }

  return (
    <div className="flex gap-2 print:hidden">
      <button type="button" disabled={busy} onClick={excel} className={buttonClass}>
        Export Excel
      </button>
      <button type="button" onClick={pdf} className={buttonClass}>
        Download PDF report
      </button>
    </div>
  );
}
