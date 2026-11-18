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
  /** printed under the list: e.g. the total spent and the spending of each company */
  summary?: { label: string; value: string; bold?: boolean }[];
  /** lines under the title, before the list: e.g. the staff member's name, the company, the month and the totals */
  info?: { label: string; value: string }[];
  /** sign-off boxes printed at the end: a line to sign on, the role under it and the name (e.g. the staff member) */
  signatures?: { label: string; name?: string }[];
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

  // the details of the sheet (whose records, the company, the period, the totals) in two columns under the title
  let startY = 34;
  const info = t.info ?? [];
  if (info.length > 0) {
    const perColumn = Math.ceil(info.length / 2);
    const colWidth = (w - 28) / 2;
    info.forEach((line, i) => {
      const x = 14 + (i < perColumn ? 0 : colWidth);
      const y = 35 + (i % perColumn) * 5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(51, 38, 43);
      const label = `${plain(line.label)}: `;
      doc.text(label, x, y);
      doc.setFont("helvetica", "normal");
      const value = doc.splitTextToSize(plain(line.value), colWidth - doc.getTextWidth(label) - 4)[0] ?? "";
      doc.text(value, x + doc.getTextWidth(label), y);
    });
    startY = 35 + perColumn * 5 + 1;
  }

  autoTable(doc, {
    startY,
    head: [t.columns.map(plain)],
    body: t.rows.map((r) => r.map((c) => plain(c))),
    styles: { fontSize: 8.5, cellPadding: 2, textColor: [51, 38, 43], lineColor: [230, 215, 210], lineWidth: 0.15, valign: "top" },
    headStyles: { fillColor: [168, 93, 107], textColor: 255 },
    alternateRowStyles: { fillColor: [250, 245, 243] },
    margin: { left: 14, right: 14, bottom: 14 },
  });

  if (t.summary && t.summary.length > 0) {
    const after = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? startY;
    const lines = t.summary;
    autoTable(doc, {
      startY: after + 6,
      head: [["Summary", "Amount"]],
      body: lines.map((l) => [plain(l.label), plain(l.value)]),
      tableWidth: 120,
      styles: { fontSize: 9, cellPadding: 2, textColor: [51, 38, 43], lineColor: [230, 215, 210], lineWidth: 0.15 },
      headStyles: { fillColor: [168, 93, 107], textColor: 255 },
      columnStyles: { 1: { halign: "right" } },
      didParseCell: (data) => {
        if (data.section === "body" && lines[data.row.index]?.bold) data.cell.styles.fontStyle = "bold";
      },
      margin: { left: 14, right: 14, bottom: 14 },
    });
  }

  // the sign-off: one box for each person who signs, side by side, after everything else (on a new page when there is no room left)
  const signatures = t.signatures ?? [];
  if (signatures.length > 0) {
    let y = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? startY) + 22;
    if (y + 18 > h - 14) {
      doc.addPage();
      y = 34;
    }
    const gap = 10;
    const boxWidth = Math.min(70, (w - 28 - gap * (signatures.length - 1)) / signatures.length);
    signatures.forEach((s, i) => {
      const x = 14 + i * (boxWidth + gap);
      doc.setDrawColor(51, 38, 43);
      doc.setLineWidth(0.3);
      doc.line(x, y, x + boxWidth, y);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(51, 38, 43);
      doc.text(plain(s.label), x, y + 5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      if (s.name) doc.text(doc.splitTextToSize(plain(s.name), boxWidth)[0] ?? "", x, y + 10);
      doc.text("Date:", x, y + (s.name ? 15 : 10));
    });
  }

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
