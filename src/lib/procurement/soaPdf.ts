"use client";

import { jsPDF } from "jspdf";
import autoTableImport from "jspdf-autotable";
import { amountInWords } from "@/lib/documents/printDocument";
import { AGING_LABELS, type SoaStatement } from "@/lib/procurement/soa";

// the package is CommonJS: depending on how it is bundled the function is the import itself or its "default"
const autoTable: typeof autoTableImport = (autoTableImport as unknown as { default?: typeof autoTableImport }).default ?? autoTableImport;

const plain = (s: string) =>
  s
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E -ÿ]/g, "");
const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

const LEFT = 12;
const TABLE_TOP = 66;

/** The top of every page of a statement: the company, the title, the creditor and the statement date (the page number is written at the end). */
function drawHeader(doc: jsPDF, s: SoaStatement) {
  const w = doc.internal.pageSize.getWidth();
  const right = w - LEFT;
  const mid = w / 2;
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.text(plain(s.company.name.toUpperCase()), mid, 14, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  let y = 18.5;
  if (s.company.registrationNo) {
    doc.text(plain(s.company.registrationNo), mid, y, { align: "center" });
    y += 4;
  }
  for (const l of s.company.addressLines) {
    doc.text(plain(l), mid, y, { align: "center" });
    y += 4;
  }
  if (s.company.phone) doc.text(plain(`Tel: ${s.company.phone}`), mid, y, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("CREDITOR STATEMENT", mid, 38, { align: "center" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("A/C No.:", LEFT, 44);
  doc.text(plain(s.accountCode || "-"), LEFT + 17, 44);
  doc.text("Creditor:", LEFT, 49.5);
  doc.setFont("helvetica", "bold");
  doc.text(plain(s.supplierName.toUpperCase()), LEFT + 17, 49.5, { maxWidth: 110 });
  doc.setFont("helvetica", "normal");
  doc.text("Address:", LEFT, 55);
  const addr = [...s.addressLines, ...(s.phone ? [`Tel: ${s.phone}`] : [])].slice(0, 4);
  addr.forEach((l, i) => doc.text(plain(l.toUpperCase()), LEFT + 17, 55 + i * 3.6, { maxWidth: 110 }));

  const labelX = right - 52;
  doc.text("Statement Date:", labelX, 44);
  doc.text(dmy(s.statementDate), right, 44, { align: "right" });
  doc.text("Terms:", labelX, 53);
  doc.text(plain(s.terms), right, 53, { align: "right" });
  doc.text("Page :", labelX, 58);
}

/** Every statement starts on a new page; the pages of each one are numbered "1 of 3" on their own. */
export function buildSoaPdf(statements: SoaStatement[]): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const right = w - LEFT;
  const ranges: { first: number; last: number }[] = [];

  statements.forEach((s, idx) => {
    if (idx > 0) doc.addPage();
    const first = doc.getCurrentPageInfo().pageNumber;
    drawHeader(doc, s);

    autoTable(doc, {
      startY: TABLE_TOP,
      head: [["DATE", "", "REF.", "DESCRIPTION", "DR", "CR", "BALANCE"]],
      body:
        s.lines.length > 0
          ? s.lines.map((l) => [dmy(l.date), l.type, plain(l.ref), plain(l.description), l.dr ? money(l.dr) : "", l.cr ? money(l.cr) : "", money(l.balance)])
          : [["", "", "", "NO TRANSACTION", "", "", "0.00"]],
      theme: "plain",
      styles: { fontSize: 8.3, cellPadding: { top: 1.2, bottom: 1.2, left: 1.2, right: 1.2 }, textColor: [20, 20, 20], valign: "top" },
      headStyles: { fontStyle: "bold", lineWidth: { top: 0.3, bottom: 0.3, left: 0, right: 0 }, lineColor: [40, 40, 40] },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 9 },
        2: { cellWidth: 34 },
        3: { cellWidth: "auto" },
        4: { cellWidth: 22, halign: "right" },
        5: { cellWidth: 22, halign: "right" },
        6: { cellWidth: 24, halign: "right" },
      },
      margin: { left: LEFT, right: LEFT, top: TABLE_TOP, bottom: 14 },
      didDrawPage: () => {
        if (doc.getCurrentPageInfo().pageNumber !== first) drawHeader(doc, s);
      },
    });

    let y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? TABLE_TOP + 10;
    if (y > h - 50) {
      doc.addPage();
      drawHeader(doc, s);
      y = TABLE_TOP;
    }
    y += 8;
    doc.setDrawColor(40, 40, 40);
    doc.setLineWidth(0.3);
    doc.line(LEFT, y - 4, right, y - 4);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    const words = doc.splitTextToSize(s.balance < 0 ? `(CREDIT) ${amountInWords(-s.balance)}` : amountInWords(s.balance), 128);
    doc.text(words, LEFT, y);
    doc.text("RM", right - 44, y);
    doc.text(":", right - 32, y);
    doc.text(money(s.balance), right, y, { align: "right" });

    y += Math.max(10, words.length * 4 + 6);
    autoTable(doc, {
      startY: y,
      head: [AGING_LABELS.slice()],
      body: [s.aging.map(money)],
      theme: "plain",
      styles: { fontSize: 8.5, halign: "center", cellPadding: 1.4, textColor: [20, 20, 20] },
      headStyles: { fontStyle: "normal" },
      margin: { left: LEFT, right: LEFT },
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 12) + 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("Any discrepancy in this statement must be reported to us in writing within 10 days.", LEFT + 3, y);

    ranges.push({ first, last: doc.getCurrentPageInfo().pageNumber });
  });

  // "Page : 1 of 3" for each statement
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  for (const r of ranges) {
    const total = r.last - r.first + 1;
    for (let p = r.first; p <= r.last; p++) {
      doc.setPage(p);
      doc.text(`${p - r.first + 1} of ${total}`, right, 58, { align: "right" });
    }
  }
  return doc;
}

/** Opens the statements as one PDF in a new tab (the window is opened by the click, so a pop-up blocker does not stop it). */
export function openSoaPdf(statements: SoaStatement[], target: Window | null): void {
  const doc = buildSoaPdf(statements);
  const url = String(doc.output("bloburl"));
  if (target && !target.closed) target.location.href = url;
  else window.open(url, "_blank");
}

/** Saves the statements as a PDF file. */
export function downloadSoaPdf(statements: SoaStatement[], filename: string): void {
  buildSoaPdf(statements).save(filename);
}
