"use client";

import { jsPDF } from "jspdf";
import autoTableImport from "jspdf-autotable";

// the package is CommonJS: depending on how it is bundled the function is the import itself or its "default"
const autoTable: typeof autoTableImport = (autoTableImport as unknown as { default?: typeof autoTableImport }).default ?? autoTableImport;

const plain = (s: string) =>
  s
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E -ÿ]/g, "");

export type PrintDocType = "PURCHASE ORDER" | "PURCHASE INVOICE" | "SALES INVOICE" | "CREDIT NOTE" | "DEBIT NOTE" | "PAYMENT VOUCHER";

export type PrintDocument = {
  type: PrintDocType;
  number: string;
  /** YYYY-MM-DD */
  date: string;
  dueDate?: string | null;
  terms?: string | null;
  /** The issuing company. */
  company: { name: string; registrationNo?: string | null };
  /** The supplier (purchase documents) or customer (sales invoice). */
  party: { label: string; name: string; address?: string | null; phone?: string | null; registrationNo?: string | null };
  /** The invoice a credit / debit note refers to. */
  reference?: string | null;
  remarks?: string | null;
  lines: { code?: string | null; description: string; quantity: number; uom?: string | null; unitPrice: number; discount?: number; amount: number }[];
  taxAmount?: number;
};

const ONES = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} HUNDRED`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ""));
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(" AND ");
}

/** 1234.50 gives "RINGGIT MALAYSIA ONE THOUSAND TWO HUNDRED AND THIRTY-FOUR AND CENTS FIFTY ONLY" (the way AutoCount prints it). */
export function amountInWords(amount: number): string {
  const sen = Math.round(Math.abs(amount) * 100);
  let ringgit = Math.floor(sen / 100);
  const cents = sen % 100;
  const groups: [number, string][] = [[1_000_000_000, "BILLION"], [1_000_000, "MILLION"], [1000, "THOUSAND"]];
  const words: string[] = [];
  for (const [size, name] of groups) {
    if (ringgit >= size) {
      words.push(`${below1000(Math.floor(ringgit / size))} ${name}`);
      ringgit %= size;
    }
  }
  if (ringgit > 0) words.push(ringgit < 100 && words.length > 0 ? `AND ${below1000(ringgit)}` : below1000(ringgit));
  const ringgitText = words.length > 0 ? words.join(" ") : "ZERO";
  return `RINGGIT MALAYSIA ${ringgitText}${cents > 0 ? ` AND CENTS ${below1000(cents)}` : ""} ONLY`;
}

const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3))));
const dmy = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);

/** The document as an A4 PDF laid out like an AutoCount print: company on top, the title, the party and document boxes, the item table, the total in words and the signature lines. */
export function buildDocumentPdf(d: PrintDocument): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const left = 12;
  const right = w - 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(30, 30, 30);
  doc.text(plain(d.company.name.toUpperCase()), left, 16);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  if (d.company.registrationNo) doc.text(plain(`Company No: ${d.company.registrationNo}`), left, 21);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(d.type, right, 16, { align: "right" });

  // the party box (left) and the document box (right)
  const top = 28;
  const boxH = 34;
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.25);
  doc.rect(left, top, 108, boxH);
  doc.rect(124, top, right - 124, boxH);

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(plain(d.party.label), left + 2, top + 5);
  doc.setFontSize(10);
  doc.text(plain(d.party.name.toUpperCase()), left + 2, top + 11, { maxWidth: 104 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const partyLines = [d.party.address ?? "", d.party.phone ? `Tel: ${d.party.phone}` : "", d.party.registrationNo ? `Reg No: ${d.party.registrationNo}` : ""].filter(Boolean).join("\n");
  if (partyLines) doc.text(doc.splitTextToSize(plain(partyLines), 104).slice(0, 5), left + 2, top + 17);

  const info: [string, string][] = [
    ["No.", d.number],
    ["Date", dmy(d.date)],
    ["Terms", d.terms || "-"],
    ...(d.dueDate ? ([["Due Date", dmy(d.dueDate)]] as [string, string][]) : []),
    ...(d.reference ? ([["Ref. Invoice", d.reference]] as [string, string][]) : []),
  ];
  doc.setFontSize(8.5);
  info.forEach(([k, v], i) => {
    const y = top + 6 + i * 5.6;
    doc.setFont("helvetica", "bold");
    doc.text(k, 126, y);
    doc.setFont("helvetica", "normal");
    doc.text(`: ${plain(v)}`, 146, y, { maxWidth: right - 148 });
  });

  const subtotal = d.lines.reduce((t, l) => t + l.amount, 0);
  const tax = d.taxAmount ?? 0;
  const total = subtotal + tax;
  const hasDiscount = d.lines.some((l) => (l.discount ?? 0) > 0);

  autoTable(doc, {
    startY: top + boxH + 4,
    head: [["No", "Item Code", "Description", "Qty", "UOM", "Unit Price", ...(hasDiscount ? ["Disc"] : []), "Amount (RM)"]],
    body: d.lines.map((l, i) => [
      String(i + 1),
      plain(l.code ?? ""),
      plain(l.description),
      qty(l.quantity),
      plain(l.uom ?? ""),
      money(l.unitPrice),
      ...(hasDiscount ? [l.discount ? money(l.discount) : ""] : []),
      money(l.amount),
    ]),
    theme: "plain",
    styles: { fontSize: 8.5, cellPadding: { top: 1.6, bottom: 1.6, left: 1.5, right: 1.5 }, textColor: [30, 30, 30], valign: "top" },
    headStyles: { fontStyle: "bold", lineWidth: { top: 0.3, bottom: 0.3, left: 0, right: 0 }, lineColor: [60, 60, 60] },
    columnStyles: { 0: { cellWidth: 9 }, 1: { cellWidth: 24 }, 3: { halign: "right", cellWidth: 16 }, 4: { cellWidth: 14 }, 5: { halign: "right", cellWidth: 24 }, [hasDiscount ? 7 : 6]: { halign: "right", cellWidth: 28 }, ...(hasDiscount ? { 6: { halign: "right", cellWidth: 18 } } : {}) },
    margin: { left, right: 12, bottom: 50 },
    didDrawPage: () => {
      doc.setFontSize(8);
      doc.setTextColor(110, 110, 110);
      doc.text(`Page ${doc.getCurrentPageInfo().pageNumber}`, right, h - 8, { align: "right" });
      doc.setTextColor(30, 30, 30);
    },
  });

  let y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 120;
  if (y > h - 62) {
    doc.addPage();
    y = 20;
  }
  y += 4;
  doc.setDrawColor(60, 60, 60);
  doc.line(left, y, right, y);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(doc.splitTextToSize(plain(amountInWords(total)), 110), left, y + 6);
  if (d.remarks) {
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(plain(`Remarks: ${d.remarks}`), 110).slice(0, 4), left, y + 18);
  }

  doc.setFont("helvetica", "normal");
  const rows: [string, string][] = tax > 0 ? [["Sub Total", money(subtotal)], ["Tax", money(tax)]] : [];
  rows.forEach(([k, v], i) => {
    doc.text(k, 140, y + 6 + i * 5);
    doc.text(v, right, y + 6 + i * 5, { align: "right" });
  });
  const totalY = y + 6 + rows.length * 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Total (RM)", 140, totalY + 1);
  doc.text(money(total), right, totalY + 1, { align: "right" });
  doc.line(138, totalY + 3, right, totalY + 3);

  const sigY = Math.max(totalY + 24, y + 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.line(left, sigY, left + 55, sigY);
  doc.line(right - 55, sigY, right, sigY);
  doc.text(d.type === "PAYMENT VOUCHER" ? "Prepared / Approved by" : "Prepared by", left, sigY + 4);
  doc.text(d.type === "PURCHASE ORDER" ? "Authorised signature" : d.type === "PAYMENT VOUCHER" ? "Received by (supplier) / Date" : "Received by / Company stamp", right - 55, sigY + 4);

  return doc;
}

/** Opens the document PDF in a new tab and asks to print it (the window is opened by the click so a pop-up blocker does not stop it). */
export function printDocument(d: PrintDocument, target: Window | null): void {
  const doc = buildDocumentPdf(d);
  doc.autoPrint();
  const url = String(doc.output("bloburl"));
  if (target && !target.closed) target.location.href = url;
  else window.open(url, "_blank");
}
