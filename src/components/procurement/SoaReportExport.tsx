"use client";

import { useState } from "react";
import { buildTablePdf, type ExportTable } from "@/lib/export/tableExport";
import type { LedgerReport } from "@/lib/finance/supplierLedger";

const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (iso: string) => iso.split("-").reverse().join("/");
const KIND_LABEL: Record<string, string> = { IN: "Invoice", DN: "Debit note", CN: "Credit note", PV: "Payment voucher", PAY: "Payment", ALLOC: "Allocation (memo)" };
const buttonClass = "h-9 rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-text hover:bg-surface-alt disabled:opacity-50";

/** The rows of every transaction, each company and each supplier kept apart, with the opening, the subtotals and the closing balance. */
function transactionRows(report: LedgerReport): string[][] {
  const rows: string[][] = [];
  for (const c of report.companies) {
    for (const s of c.suppliers) {
      const t = s.totals;
      rows.push([c.companyName, s.supplierName, dmy(report.periodStart), "Opening", "", "Balance brought forward", "", "", money(t.opening)]);
      for (const l of s.lines) rows.push([c.companyName, s.supplierName, dmy(l.date), KIND_LABEL[l.kind] ?? l.kind, l.ref, l.description, l.cr ? money(l.cr) : "", l.dr ? money(l.dr) : "", l.memo ? "(memo)" : money(l.balance)]);
      rows.push([c.companyName, s.supplierName, dmy(report.periodEnd), "Closing", "", "Supplier subtotal / closing balance", money(t.invoices + t.debitNotes), money(t.payments + t.creditNotes), money(t.closing)]);
    }
    const t = c.totals;
    rows.push([c.companyName, "COMPANY SUBTOTAL", "", "", "", `${c.suppliers.length} suppliers · opening ${money(t.opening)}`, money(t.invoices + t.debitNotes), money(t.payments + t.creditNotes), money(t.closing)]);
  }
  return rows;
}

function summaryRows(report: LedgerReport): string[][] {
  const rows: string[][] = [];
  for (const c of report.companies) {
    for (const s of c.suppliers) {
      const t = s.totals;
      rows.push([c.companyName, s.accountCode ?? "", s.supplierName, money(t.opening), money(t.invoices), money(t.debitNotes), money(t.creditNotes), money(t.payments), money(t.closing)]);
    }
    const t = c.totals;
    rows.push([c.companyName, "", "COMPANY SUBTOTAL", money(t.opening), money(t.invoices), money(t.debitNotes), money(t.creditNotes), money(t.payments), money(t.closing)]);
  }
  const t = report.consolidated;
  rows.push(["ALL COMPANIES", "", "CONSOLIDATED (company ledgers kept separate above)", money(t.opening), money(t.invoices), money(t.debitNotes), money(t.creditNotes), money(t.payments), money(t.closing)]);
  return rows;
}

const SUMMARY_COLUMNS = ["Company", "A/C No.", "Supplier", "Opening (RM)", "Invoices (RM)", "Debit notes (RM)", "Credit notes (RM)", "Payments (RM)", "Closing (RM)"];
const TX_COLUMNS = ["Company", "Supplier", "Date", "Type", "Reference", "Description", "Invoice / DN (RM)", "Payment / CN (RM)", "Balance (RM)"];

/** PDF and Excel of the SOA report: the summary per supplier and company, and every transaction. Built from the report on the page. */
export function SoaReportExport({ report, subtitle, filename }: { report: LedgerReport; subtitle: string; filename: string }) {
  const [busy, setBusy] = useState(false);
  const empty = report.companies.every((c) => c.suppliers.length === 0);

  async function excel() {
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.utils.book_new();
      const add = (name: string, columns: string[], rows: string[][]) => {
        const sheet = XLSX.utils.aoa_to_sheet([[`Supplier SOA Report · ${subtitle}`], [], columns, ...rows]);
        sheet["!cols"] = columns.map((c, i) => ({ wch: Math.min(50, Math.max(c.length, ...rows.map((r) => (r[i] ?? "").length)) + 2) }));
        XLSX.utils.book_append_sheet(book, sheet, name);
      };
      add("Summary", SUMMARY_COLUMNS, summaryRows(report));
      add("Transactions", TX_COLUMNS, transactionRows(report));
      XLSX.writeFile(book, `${filename}.xlsx`);
    } finally {
      setBusy(false);
    }
  }

  function pdf() {
    const t = report.consolidated;
    const table: ExportTable = {
      title: "Supplier SOA Report",
      subtitle,
      columns: TX_COLUMNS,
      rows: transactionRows(report),
      landscape: true,
      info: report.companies.map((c) => ({ label: c.companyName, value: `opening RM ${money(c.totals.opening)} · closing RM ${money(c.totals.closing)} (${c.suppliers.length} suppliers)` })),
      summary: [
        { label: "Opening balance (all companies)", value: `RM ${money(t.opening)}` },
        { label: "Invoices + debit notes", value: `RM ${money(t.invoices + t.debitNotes)}` },
        { label: "Payments + credit notes", value: `RM ${money(t.payments + t.creditNotes)}` },
        { label: "Closing balance (all companies, each ledger kept separate)", value: `RM ${money(t.closing)}`, bold: true },
      ],
    };
    buildTablePdf(table).save(`${filename}.pdf`);
  }

  return (
    <div className="flex gap-2 print:hidden">
      <button type="button" disabled={empty || busy} onClick={excel} className={buttonClass}>
        Export Excel
      </button>
      <button type="button" disabled={empty} onClick={pdf} className={buttonClass}>
        Download PDF
      </button>
    </div>
  );
}
