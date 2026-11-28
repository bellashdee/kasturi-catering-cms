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
  /** wide tables are better on a landscape page (a table too wide for a portrait page is turned to landscape anyway) */
  landscape?: boolean;
  /** headers of the RM columns: right-aligned and kept on one line in the print (a column of plain numbers is found by itself) */
  moneyColumns?: string[];
  /** printed under the list: e.g. the total spent and the spending of each company */
  summary?: { label: string; value: string; bold?: boolean }[];
  /** lines under the title, before the list: e.g. the staff member's name, the company, the month and the totals */
  info?: { label: string; value: string }[];
  /** sign-off boxes printed at the end: a line to sign on, the role under it and the name (e.g. the staff member) */
  signatures?: { label: string; name?: string }[];
};

/** Columns put together in one column of the printed page only (the Excel file keeps them apart): each value on its own line. */
export type PrintColumnGroup = {
  header: string;
  columns: string[];
  /** words put before each value, e.g. [null, "Claimant: "], so that every value can still be told apart */
  labels?: (string | null)[];
};

/** The table with the grouped columns put together (each group takes the place of its first column). */
export function groupColumnsForPrint(columns: string[], rows: string[][], groups: PrintColumnGroup[]): { columns: string[]; rows: string[][] } {
  const plan: { header: string; parts: { index: number; label: string }[] }[] = [];
  const taken = new Set<number>();
  columns.forEach((c, i) => {
    if (taken.has(i)) return;
    const group = groups.find((g) => g.columns[0] === c);
    if (!group) {
      plan.push({ header: c, parts: [{ index: i, label: "" }] });
      return;
    }
    const parts = group.columns
      .map((name, k) => ({ index: columns.indexOf(name), label: group.labels?.[k] ?? "" }))
      .filter((p) => p.index >= 0);
    parts.forEach((p) => taken.add(p.index));
    plan.push({ header: group.header, parts });
  });
  return {
    columns: plan.map((p) => p.header),
    rows: rows.map((r) =>
      plan.map((p) =>
        p.parts
          .map((part) => {
            const value = (r[part.index] ?? "").trim();
            return value ? `${part.label}${value}` : "";
          })
          .filter(Boolean)
          .join("\n"),
      ),
    ),
  };
}

const fileBase = (t: ExportTable) => `${t.title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}-${todayInMalaysia()}`;

const MARGIN = 12;
const PAD = 2.2;
// a word longer than this (e.g. a web link) may still be cut to fit its column
const LONGEST_WORD = 48;
const MONEY = /^\(?-?(RM\s?)?-?[\d,]+(\.\d+)?\)?$/;
const INK: [number, number, number] = [51, 38, 43];
const MUTED: [number, number, number] = [110, 100, 100];
const ROSE: [number, number, number] = [168, 93, 107];
const LINE: [number, number, number] = [225, 210, 205];

const widestWord = (doc: jsPDF, texts: string[]) => {
  let widest = 0;
  for (const text of texts) for (const word of text.split(/\s+/)) if (word) widest = Math.max(widest, doc.getTextWidth(word));
  return widest;
};
const widestLine = (doc: jsPDF, texts: string[]) => {
  let widest = 0;
  for (const text of texts) for (const line of text.split("\n")) widest = Math.max(widest, doc.getTextWidth(line));
  return widest;
};

/**
 * The narrowest width of each column that still keeps every word whole (the money columns on one line), at the largest
 * readable text size that lets them all fit across the page. Null when even the smallest size does not fit.
 */
function fitColumns(doc: jsPDF, columns: string[], rows: string[][], money: boolean[], width: number): { fontSize: number; minWidths: number[] } | null {
  for (const fontSize of [10, 9.5, 9]) {
    doc.setFontSize(fontSize);
    const minWidths = columns.map((c, i) => {
      doc.setFont("helvetica", "bold");
      const head = Math.min(widestWord(doc, [c]), LONGEST_WORD);
      doc.setFont("helvetica", "normal");
      const values = rows.map((r) => r[i] ?? "");
      const body = money[i] ? widestLine(doc, values) : Math.min(widestWord(doc, values), LONGEST_WORD);
      return Math.max(head, body) + PAD * 2 + 0.5;
    });
    if (minWidths.reduce((t, x) => t + x, 0) <= width) return { fontSize, minWidths };
  }
  return null;
}

/** The table as a clean A4 PDF with a title, the date it was prepared and page numbers: for reading and printing. */
export function buildTablePdf(t: ExportTable): jsPDF {
  const columns = t.columns.map(plain);
  const rows = t.rows.map((r) => r.map((c) => plain(c)));
  const moneyNames = (t.moneyColumns ?? []).map(plain);
  const money = columns.map(
    (c, i) =>
      moneyNames.includes(c) ||
      (rows.some((r) => (r[i] ?? "").trim() !== "") && rows.every((r) => (r[i] ?? "").trim() === "" || MONEY.test((r[i] ?? "").trim()))),
  );

  // portrait when the columns fit on it with whole words, otherwise (or when asked) landscape
  const measure = new jsPDF({ unit: "mm", format: "a4" });
  const portraitFit = t.landscape ? null : fitColumns(measure, columns, rows, money, 210 - MARGIN * 2);
  const landscape = !portraitFit;
  const fit = portraitFit ?? fitColumns(measure, columns, rows, money, 297 - MARGIN * 2);

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: landscape ? "landscape" : "portrait" });
  doc.setLineHeightFactor(1.3);
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  doc.setFillColor(...ROSE);
  doc.rect(0, 0, w, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...ROSE);
  doc.text("CENTRAL MANAGEMENT SYSTEM", MARGIN, 13);
  doc.setFontSize(16);
  doc.setTextColor(...INK);
  const titleLines = (doc.splitTextToSize(plain(t.title), w - MARGIN * 2) as string[]).slice(0, 2);
  doc.text(titleLines, MARGIN, 21);
  let y = 21 + (titleLines.length - 1) * 7;
  if (t.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    y += 6;
    doc.text(plain(t.subtitle), MARGIN, y);
  }
  y += 4;

  // the details of the sheet (whose records, the company, the period, the totals) in two tidy columns under the title:
  // the labels in bold, the values lined up after them
  const info = t.info ?? [];
  if (info.length > 0) {
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, y, w - MARGIN, y);
    y += 6;
    const gap = 12;
    const colWidth = (w - MARGIN * 2 - gap) / 2;
    const perColumn = Math.ceil(info.length / 2);
    const halves = [info.slice(0, perColumn), info.slice(perColumn)];
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    const labelWidths = halves.map((half) => Math.min(colWidth * 0.45, Math.max(0, ...half.map((l) => doc.getTextWidth(`${plain(l.label)}:`))) + 4));
    const lineHeight = 5;
    for (let row = 0; row < perColumn; row++) {
      let lines = 1;
      halves.forEach((half, side) => {
        const line = half[row];
        if (!line) return;
        const x = MARGIN + side * (colWidth + gap);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...INK);
        doc.text(`${plain(line.label)}:`, x, y);
        doc.setFont("helvetica", "normal");
        const value = (doc.splitTextToSize(plain(line.value) || "-", colWidth - labelWidths[side]) as string[]).slice(0, 2);
        doc.text(value, x + labelWidths[side], y);
        lines = Math.max(lines, value.length);
      });
      y += lines * lineHeight + 0.8;
    }
    y -= 1;
    doc.line(MARGIN, y, w - MARGIN, y);
    y += 4;
  }

  const fontSize = fit?.fontSize ?? 8.5;
  const columnStyles: Record<number, { minCellWidth?: number; halign?: "right" }> = {};
  columns.forEach((_, i) => {
    columnStyles[i] = { ...(fit ? { minCellWidth: fit.minWidths[i] } : {}), ...(money[i] ? { halign: "right" as const } : {}) };
  });
  autoTable(doc, {
    startY: y,
    head: [columns],
    body: rows,
    // the headings again on every page; a row is not split over two pages
    showHead: "everyPage",
    rowPageBreak: "avoid",
    styles: { font: "helvetica", fontSize, cellPadding: PAD, textColor: INK, lineColor: LINE, lineWidth: 0.2, valign: "top", overflow: "linebreak" },
    headStyles: { fillColor: ROSE, textColor: 255, fontStyle: "bold", valign: "middle" },
    alternateRowStyles: { fillColor: [250, 245, 243] },
    columnStyles,
    didParseCell: (data) => {
      if (data.section === "head" && money[data.column.index]) data.cell.styles.halign = "right";
    },
    margin: { left: MARGIN, right: MARGIN, top: 14, bottom: 16 },
  });

  if (t.summary && t.summary.length > 0) {
    const after = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y;
    const lines = t.summary;
    autoTable(doc, {
      startY: after + 8,
      head: [["Summary", "Amount"]],
      body: lines.map((l) => [plain(l.label), plain(l.value)]),
      tableWidth: 130,
      showHead: "everyPage",
      rowPageBreak: "avoid",
      styles: { fontSize: 10, cellPadding: PAD, textColor: INK, lineColor: LINE, lineWidth: 0.2 },
      headStyles: { fillColor: ROSE, textColor: 255 },
      columnStyles: { 1: { halign: "right", minCellWidth: 34 } },
      didParseCell: (data) => {
        if (data.column.index === 1 && data.section === "head") data.cell.styles.halign = "right";
        if (data.section === "body" && lines[data.row.index]?.bold) data.cell.styles.fontStyle = "bold";
      },
      margin: { left: MARGIN, right: MARGIN, top: 14, bottom: 16 },
    });
  }

  // the sign-off: one box for each person who signs, side by side, after everything else (on a new page when there is no room left)
  const signatures = t.signatures ?? [];
  if (signatures.length > 0) {
    let sy = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y) + 24;
    if (sy + 20 > h - 16) {
      doc.addPage();
      sy = 34;
    }
    const gap = 12;
    const boxWidth = Math.min(72, (w - MARGIN * 2 - gap * (signatures.length - 1)) / signatures.length);
    signatures.forEach((s, i) => {
      const x = MARGIN + i * (boxWidth + gap);
      doc.setDrawColor(...INK);
      doc.setLineWidth(0.3);
      doc.line(x, sy, x + boxWidth, sy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      doc.text(plain(s.label), x, sy + 5.5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      if (s.name) doc.text((doc.splitTextToSize(plain(s.name), boxWidth) as string[])[0] ?? "", x, sy + 11);
      doc.text("Date:", x, sy + (s.name ? 16.5 : 11));
    });
  }

  const pages = doc.getNumberOfPages();
  const prepared = `Prepared: ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "long", timeStyle: "short" })} (Malaysia time)`;
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(plain(prepared), MARGIN, h - 8);
    doc.text(`Page ${i} of ${pages}`, w - MARGIN, h - 8, { align: "right" });
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
