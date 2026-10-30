"use client";

import { jsPDF } from "jspdf";
import autoTableImport from "jspdf-autotable";
import { todayInMalaysia } from "@/lib/format";

// the package is CommonJS: depending on how it is bundled the function is the import itself or its "default"
const autoTable: typeof autoTableImport = (autoTableImport as unknown as { default?: typeof autoTableImport }).default ?? autoTableImport;

// the standard PDF fonts have no exotic dashes or quotes: keep the text to characters they can draw
const plain = (s: string) =>
  s
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E -ÿ]/g, "");

export type ExportTable = {
  /** the title on the page / the Excel sheet name */
  title: string;
  /** one line under the title: the company, the filters, the count */
  subtitle?: string;
  columns: string[];
  rows: string[][];
  /** wide tables are better on a landscape page */
  landscape?: boolean;
};

const fileBase = (t: ExportTable) => `${t.title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}-${todayInMalaysia()}`;

/** The table as a clean A4 PDF with a title, the date it was prepared and page numbers: for reading and printing. */
export function buildTablePdf(t: ExportTable): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: t.landscape ? "landscape" : "portrait" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  doc.setFillColor(168, 93, 107);
  doc.rect(0, 0, w, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(168, 93, 107);
  doc.text("CENTRAL MANAGEMENT SYSTEM", 14, 14);
  doc.setFontSize(17);
  doc.setTextColor(51, 38, 43);
  doc.text(plain(t.title), 14, 23);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(110, 100, 100);
  if (t.subtitle) doc.text(plain(t.subtitle), 14, 29);

  autoTable(doc, {
    startY: 34,
    head: [t.columns.map(plain)],
    body: t.rows.map((r) => r.map((c) => plain(c))),
    styles: { fontSize: 8.5, cellPadding: 2, textColor: [51, 38, 43], lineColor: [230, 215, 210], lineWidth: 0.15, valign: "top" },
    headStyles: { fillColor: [168, 93, 107], textColor: 255 },
    alternateRowStyles: { fillColor: [250, 245, 243] },
    margin: { left: 14, right: 14, bottom: 14 },
  });

  const pages = doc.getNumberOfPages();
  const prepared = `Prepared: ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "long", timeStyle: "short" })} (Malaysia time)`;
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110, 100, 100);
    doc.text(plain(prepared), 14, h - 8);
    doc.text(`Page ${i} of ${pages}`, w - 14, h - 8, { align: "right" });
  }
  return doc;
}

/** Opens the PDF in a new tab and asks to print it (the window is opened by the click, so a pop-up blocker does not stop it). */
export function printTablePdf(t: ExportTable, target: Window | null): void {
  const doc = buildTablePdf(t);
  doc.autoPrint();
  const url = String(doc.output("bloburl"));
  if (target && !target.closed) target.location.href = url;
  else window.open(url, "_blank");
}

/** The table as an Excel file (one sheet, a bold header row, columns wide enough for their text). */
export async function downloadTableExcel(t: ExportTable): Promise<void> {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet([t.columns, ...t.rows]);
  sheet["!cols"] = t.columns.map((c, i) => ({ wch: Math.min(60, Math.max(c.length, ...t.rows.map((r) => (r[i] ?? "").length)) + 2) }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, t.title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1");
  XLSX.writeFile(book, `${fileBase(t)}.xlsx`);
}
