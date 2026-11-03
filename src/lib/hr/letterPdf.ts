"use client";

import { jsPDF } from "jspdf";

// the standard PDF fonts have no exotic dashes or quotes: keep the text to characters they can draw
const plain = (s: string) =>
  s
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E -ÿ\n]/g, "");

/** An A4 letter on the company's name: the text as written in the editor, wrapped, with the heading line in bold. */
export function buildLetterPdf(input: { companyName: string; text: string }): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const left = 22;
  const right = 22;
  const width = w - left - right;
  const lineHeight = 5.4;
  const header = () => {
    doc.setFont("times", "bold");
    doc.setFontSize(15);
    doc.setTextColor(60, 30, 40);
    doc.text(plain(input.companyName.toUpperCase()), left, 20);
    doc.setDrawColor(168, 93, 107);
    doc.setLineWidth(0.6);
    doc.line(left, 24, w - right, 24);
  };
  header();
  let y = 36;
  doc.setTextColor(30, 30, 30);

  for (const raw of plain(input.text).split("\n")) {
    const line = raw.trimEnd();
    const bold = /^RE\s*:/i.test(line) || /^(Sincerely yours|Acknowledgment)/i.test(line);
    doc.setFont("times", bold ? "bold" : "normal");
    doc.setFontSize(11);
    const wrapped = line === "" ? [""] : (doc.splitTextToSize(line, width) as string[]);
    for (const piece of wrapped) {
      if (y > h - 22) {
        doc.addPage();
        header();
        y = 36;
        doc.setTextColor(30, 30, 30);
        doc.setFont("times", bold ? "bold" : "normal");
        doc.setFontSize(11);
      }
      if (piece) doc.text(piece, left, y);
      y += line === "" ? lineHeight * 0.7 : lineHeight;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("times", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 110, 110);
    doc.text(`Page ${i} of ${pages}`, w - right, h - 10, { align: "right" });
  }
  return doc;
}

export function letterPdfFile(input: { companyName: string; text: string; filename: string }): File {
  const blob = buildLetterPdf(input).output("blob");
  return new File([blob], input.filename, { type: "application/pdf" });
}

export function downloadLetterPdf(input: { companyName: string; text: string; filename: string }) {
  buildLetterPdf(input).save(input.filename);
}
