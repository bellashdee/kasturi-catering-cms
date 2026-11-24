"use client";

import { jsPDF } from "jspdf";
import autoTableImport from "jspdf-autotable";
import { MILEAGE_RATE_RM, PURPOSE_CODES, mileageSummary, type MileageTrip } from "@/lib/hr/mileage";

// the package is CommonJS: depending on how it is bundled the function is the import itself or its "default"
const autoTable: typeof autoTableImport = (autoTableImport as unknown as { default?: typeof autoTableImport }).default ?? autoTableImport;

const plain = (s: string) => s.replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E -ÿ]/g, "");
const km = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const NAVY: [number, number, number] = [22, 35, 66];

/** The month's Mileage Log as an A4 PDF, laid out like the printed mileage log form (with the staff name in place of "Driver"). */
export function buildMileagePdf(p: { staffName: string; companyName: string; monthLabel: string; trips: MileageTrip[]; notes: string }): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const L = 12;
  const R = w - 12;

  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text("MILEAGE LOG", w / 2, 20, { align: "center" });
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.text(plain(p.companyName.toUpperCase()), w / 2, 26, { align: "center" });
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.3);
  doc.line(w / 2 - 55, 30, w / 2 - 33, 30);
  doc.line(w / 2 + 33, 30, w / 2 + 55, 30);
  doc.text("KEEP ACCURATE MILEAGE RECORDS", w / 2, 31, { align: "center" });

  // STAFF and MONTH / YEAR boxes
  const boxY = 37;
  doc.setFillColor(...NAVY);
  doc.rect(L, boxY, 22, 8, "F");
  doc.rect(L + 22, boxY, 92, 8);
  doc.rect(L + 118, boxY, 30, 8, "F");
  doc.rect(L + 148, boxY, R - L - 148, 8);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("STAFF:", L + 3, boxY + 5.4);
  doc.text("MONTH / YEAR:", L + 120, boxY + 5.4);
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(plain(p.staffName.toUpperCase()), L + 25, boxY + 5.5, { maxWidth: 87 });
  doc.text(plain(p.monthLabel.toUpperCase()), L + 151, boxY + 5.5);

  const MIN_ROWS = 20;
  const body = p.trips.map((t) => [dmy(t.trip_date), plain(t.from_place), plain(t.to_place), plain(t.purpose ?? ""), km(Number(t.start_km)), km(Number(t.end_km)), km(Number(t.total_km)), String(t.purpose_code)]);
  while (body.length < MIN_ROWS) body.push(["", "", "", "", "", "", "", ""]);

  autoTable(doc, {
    startY: boxY + 12,
    head: [["DATE", "FROM", "TO", "PURPOSE / NOTES", "START\nMILEAGE", "END\nMILEAGE", "TOTAL\nKM", "PURPOSE\nCODE"]],
    body,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.4, textColor: [20, 20, 20], lineColor: [150, 155, 170], lineWidth: 0.2, minCellHeight: 6.2, valign: "middle" },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", halign: "center", fontSize: 7.5 },
    columnStyles: {
      0: { cellWidth: 19 },
      1: { cellWidth: 27 },
      2: { cellWidth: 27 },
      3: { cellWidth: "auto" },
      4: { cellWidth: 19, halign: "right" },
      5: { cellWidth: 19, halign: "right" },
      6: { cellWidth: 17, halign: "right" },
      7: { cellWidth: 16, halign: "center" },
    },
    margin: { left: L, right: 12, bottom: 14 },
  });

  const s = mileageSummary(p.trips);
  let y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 150;
  if (y > h - 62) {
    doc.addPage();
    y = 16;
  }
  // TOTAL KM box
  y += 3;
  doc.setFillColor(...NAVY);
  doc.rect(R - 78, y, 30, 7, "F");
  doc.rect(R - 48, y, 48, 7);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("TOTAL KM:", R - 76, y + 4.8);
  doc.setTextColor(20, 20, 20);
  doc.text(km(s.total), R - 2, y + 4.8, { align: "right" });
  // the claim: business km x RM0.80
  doc.setFillColor(...NAVY);
  doc.rect(L, y, 30, 7, "F");
  doc.rect(L + 30, y, 70, 7);
  doc.setTextColor(255, 255, 255);
  doc.text("CLAIM (RM):", L + 2, y + 4.8);
  doc.setTextColor(20, 20, 20);
  doc.text(`${km(s.business)} km x RM${MILEAGE_RATE_RM.toFixed(2)} = RM ${s.claim.toFixed(2)}`, L + 32, y + 4.8);

  // three boxes: purpose codes, summary, notes
  y += 12;
  const colW = (R - L - 8) / 3;
  const boxH = 42;
  const boxes = [L, L + colW + 4, L + 2 * (colW + 4)];
  const titles = ["PURPOSE CODES", "SUMMARY", "NOTES"];
  boxes.forEach((x, i) => {
    doc.setFillColor(...NAVY);
    doc.rect(x, y, colW, 7, "F");
    doc.rect(x, y, colW, boxH);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(titles[i], x + colW / 2, y + 4.8, { align: "center" });
  });
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  PURPOSE_CODES.forEach((c, i) => doc.text(`${c.code}  -  ${c.label}`, boxes[0] + 3, y + 13 + i * 6));
  const sum: [string, number][] = [["BUSINESS KM", s.business], ["PERSONAL KM", s.personal], ["OTHER KM", s.other]];
  sum.forEach(([label, v], i) => {
    doc.text(label, boxes[1] + 3, y + 13 + i * 7);
    doc.text(km(v), boxes[1] + colW - 3, y + 13 + i * 7, { align: "right" });
  });
  doc.setFillColor(225, 230, 240);
  doc.rect(boxes[1] + 0.2, y + boxH - 9, colW - 0.4, 8.8, "F");
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL KM", boxes[1] + 3, y + boxH - 3.5);
  doc.text(km(s.total), boxes[1] + colW - 3, y + boxH - 3.5, { align: "right" });
  doc.setFont("helvetica", "normal");
  if (p.notes.trim()) doc.text(doc.splitTextToSize(plain(p.notes), colW - 6).slice(0, 8), boxes[2] + 3, y + 13);
  else for (let i = 0; i < 5; i++) doc.line(boxes[2] + 3, y + 15 + i * 6, boxes[2] + colW - 3, y + 15 + i * 6);

  doc.setFontSize(7.5);
  doc.setTextColor(110, 110, 110);
  doc.text(`Prepared ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" })}`, L, h - 8);
  return doc;
}

export function openMileagePdf(p: Parameters<typeof buildMileagePdf>[0], target: Window | null) {
  const url = String(buildMileagePdf(p).output("bloburl"));
  if (target && !target.closed) target.location.href = url;
  else window.open(url, "_blank");
}
