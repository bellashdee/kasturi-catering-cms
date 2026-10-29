"use client";

import { jsPDF } from "jspdf";
import autoTableImport from "jspdf-autotable";
import { COMPANY_DOC_TYPE_LABEL } from "@/lib/hr/constants";
import { todayInMalaysia } from "@/lib/format";
import type { CompanyDocData } from "@/components/hr/CompanyDocumentRow";

// the package is CommonJS: depending on how it is bundled the function is the import itself or its "default"
const autoTable: typeof autoTableImport = (autoTableImport as unknown as { default?: typeof autoTableImport }).default ?? autoTableImport;

// the standard PDF fonts have no exotic dashes or quotes: keep the text to characters they can draw
const plain = (s: string) =>
  s
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E -ÿ]/g, "");

const INK: [number, number, number] = [51, 38, 43];
const ACCENT: [number, number, number] = [168, 93, 107];
const SOFT: [number, number, number] = [250, 241, 238];
const GREY: [number, number, number] = [110, 100, 100];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** 2027-02-24 → 24 Feb 2027 */
const niceDate = (iso: string | null) => {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
};
const dayNumber = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};
const STATUS_TEXT: Record<CompanyDocData["urgency"], string> = {
  valid: "Valid",
  expiring_soon: "Expiring soon",
  expired: "EXPIRED",
  no_expiry: "No expiry date",
};
/** "Valid (2 years 3 months left)" style status line */
function statusLine(d: CompanyDocData): string {
  if (!d.expiryDate) return STATUS_TEXT.no_expiry;
  const left = dayNumber(d.expiryDate) - dayNumber(todayInMalaysia());
  if (left < 0) return `EXPIRED ${-left} day${-left === 1 ? "" : "s"} ago`;
  if (left === 0) return "Expires today";
  if (left <= 30) return `Expiring soon: ${left} day${left === 1 ? "" : "s"} left`;
  const months = Math.floor(left / 30.4375);
  return months >= 12 ? `Valid (about ${Math.floor(months / 12)} year${months >= 24 ? "s" : ""}${months % 12 ? ` ${months % 12} month${months % 12 === 1 ? "" : "s"}` : ""} left)` : `Valid (about ${months} month${months === 1 ? "" : "s"} left)`;
}

const preparedText = () => `Prepared: ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "long", timeStyle: "short" })} (Malaysia time)`;

function header(doc: jsPDF, title: string, subtitle: string) {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, pageW, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...ACCENT);
  doc.text("CENTRAL MANAGEMENT SYSTEM", 14, 14);
  doc.setFontSize(18);
  doc.setTextColor(...INK);
  doc.text(plain(title), 14, 24);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...GREY);
  doc.text(plain(subtitle), 14, 30);
  doc.setDrawColor(230, 215, 210);
  doc.line(14, 33, pageW - 14, 33);
  doc.setTextColor(...INK);
}

function footers(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text(plain(preparedText()), 14, h - 8);
    doc.text(`Page ${i} of ${pages}`, w - 14, h - 8, { align: "right" });
  }
}

const fileSafe = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "document";

/** One licence / registration as a clean A4 page: what it is, the numbers and dates, and whether it is still valid. */
export function buildDocumentSummaryPdf(d: CompanyDocData): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  header(doc, "Licence / Document Summary", d.companyName);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  const titleLines = doc.splitTextToSize(plain(d.title), 182) as string[];
  doc.text(titleLines, 14, 44);
  const y0 = 44 + titleLines.length * 6.5 + 2;

  const rows: string[][] = [
    ["Company", d.companyName],
    ["Document type", COMPANY_DOC_TYPE_LABEL[d.docType] ?? d.docType],
    ["Reference / number", d.referenceNumber ?? "-"],
    ["Issued / dated", niceDate(d.issuedDate)],
    ["Expiry date", d.expiryDate ? niceDate(d.expiryDate) : "None (this document does not expire)"],
    ["Status", statusLine(d)],
  ];
  if (d.notes) rows.push(["Notes", d.notes]);

  autoTable(doc, {
    startY: y0,
    body: rows.map((r) => r.map(plain)),
    theme: "grid",
    styles: { fontSize: 11, cellPadding: 3.2, textColor: INK, lineColor: [230, 215, 210], lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 48, fontStyle: "bold", fillColor: SOFT }, 1: { cellWidth: "auto" } },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 1 && data.row.index === 5) {
        data.cell.styles.fontStyle = "bold";
        if (d.urgency === "expired") data.cell.styles.textColor = [185, 28, 28];
        else if (d.urgency === "expiring_soon") data.cell.styles.textColor = [180, 100, 10];
        else if (d.urgency === "valid") data.cell.styles.textColor = [22, 120, 70];
      }
    },
  });

  const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  doc.text("This is a summary of the details recorded in the system. The original document is kept in the system as the official copy.", 14, y, { maxWidth: 182 });
  footers(doc);
  return doc;
}

export const downloadDocumentSummaryPdf = (d: CompanyDocData) => buildDocumentSummaryPdf(d).save(`${fileSafe(d.title)}-summary.pdf`);

/** The licences listed (all of them, or the ones the filters show) as a landscape register, grouped by company. */
export function buildRegisterPdf(docs: CompanyDocData[], filterNote: string): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  header(doc, "Licences & Documents Summary", filterNote || "All documents");

  const count = (u: CompanyDocData["urgency"]) => docs.filter((d) => d.urgency === u).length;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(
    plain(`${docs.length} document${docs.length === 1 ? "" : "s"}:  ${count("valid")} valid,  ${count("expiring_soon")} expiring within 30 days,  ${count("expired")} expired,  ${count("no_expiry")} with no expiry date`),
    14,
    40,
  );

  const byCompany = new Map<string, CompanyDocData[]>();
  for (const d of docs) byCompany.set(d.companyName, [...(byCompany.get(d.companyName) ?? []), d]);

  let y = 46;
  for (const [company, list] of [...byCompany.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    autoTable(doc, {
      startY: y,
      head: [[{ content: plain(company), colSpan: 6, styles: { fillColor: ACCENT, textColor: 255, fontSize: 11 } }], ["Document", "Type", "Reference", "Issued", "Expires", "Status"]],
      body: list.map((d) => [plain(d.title), plain(COMPANY_DOC_TYPE_LABEL[d.docType] ?? d.docType), plain(d.referenceNumber ?? "-"), niceDate(d.issuedDate), d.expiryDate ? niceDate(d.expiryDate) : "No expiry", plain(statusLine(d))]),
      styles: { fontSize: 8.5, cellPadding: 2, textColor: INK, lineColor: [230, 215, 210], lineWidth: 0.15, valign: "top" },
      headStyles: { fillColor: SOFT, textColor: INK },
      columnStyles: { 0: { cellWidth: 82 }, 1: { cellWidth: 40 }, 2: { cellWidth: 52 }, 3: { cellWidth: 24 }, 4: { cellWidth: 24 }, 5: { cellWidth: "auto" } },
      margin: { left: 14, right: 14, bottom: 14 },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 5) {
          const u = list[data.row.index]?.urgency;
          data.cell.styles.fontStyle = "bold";
          if (u === "expired") data.cell.styles.textColor = [185, 28, 28];
          else if (u === "expiring_soon") data.cell.styles.textColor = [180, 100, 10];
          else if (u === "valid") data.cell.styles.textColor = [22, 120, 70];
        }
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }
  void pageW;
  footers(doc);
  return doc;
}

export const downloadRegisterPdf = (docs: CompanyDocData[], filterNote: string) => buildRegisterPdf(docs, filterNote).save(`licences-and-documents-summary-${todayInMalaysia()}.pdf`);
