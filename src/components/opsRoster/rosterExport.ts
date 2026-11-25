"use client";

import { dayTitle, entryHours, hoursText, STATUS, slotsLine, taskLine, type DayRoster, type RosterStaff } from "@/lib/opsRoster/shared";

/**
 * The day's roster as an A4 PDF (download or print): the title, the date, a block per staff member (name, status, hours, tasks)
 * and the remarks. Text only, so it prints clearly on any printer.
 */
export async function dayRosterPdf(day: DayRoster, staff: RosterStaff[], mode: "download" | "print") {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const name = new Map(staff.map((s) => [s.id, s.shortName]));
  const left = 16;
  const width = 178;
  let y = 18;
  const ensure = (h: number) => {
    if (y + h > 285) {
      doc.addPage();
      y = 18;
    }
  };
  const plain = (s: string) => s.replace(/[–—]/g, "-").replace(/•/g, "-");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("JADUAL DRIVER & OPERATION", left, y);
  y += 7;
  doc.setFontSize(12);
  doc.text(dayTitle(day.date), left, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  if (day.updatedAt) doc.text(`Last updated ${new Date(day.updatedAt).toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur" })}${day.updatedByName ? ` by ${day.updatedByName}` : ""}`, left, (y += 4));
  y += 6;

  for (const e of day.entries) {
    const lines: { text: string; bold?: boolean; size?: number }[] = [];
    lines.push({ text: `${name.get(e.staffId) ?? ""}   [${STATUS[e.status].label}${e.status === "on_duty" && slotsLine(e).endsWith("+ OT") ? " + OT" : ""}]`, bold: true, size: 12 });
    if (e.status === "on_duty") {
      const hours = slotsLine(e);
      if (hours) {
        const { worked, ot } = entryHours(e);
        lines.push({ text: `${hours}${worked ? `   (${hoursText(worked)}${ot ? `, OT ${hoursText(ot)}` : ""})` : ""}`, bold: true, size: 10.5 });
      }
      for (const t of e.tasks) lines.push({ text: `•  ${taskLine(t)}`, size: 10.5 });
    } else lines.push({ text: `•  ${STATUS[e.status].label}`, size: 10.5 });
    if (e.note) lines.push({ text: `Note: ${e.note}`, size: 9.5 });

    const wrapped = lines.flatMap((l) => (doc.setFontSize(l.size ?? 10.5), doc.splitTextToSize(plain(l.text), width) as string[]).map((t, i) => ({ ...l, text: i ? `   ${t}` : t })));
    ensure(wrapped.length * 5.2 + 5);
    doc.setDrawColor(210);
    doc.line(left, y - 4, left + width, y - 4);
    for (const l of wrapped) {
      doc.setFont("helvetica", l.bold ? "bold" : "normal");
      doc.setFontSize(l.size ?? 10.5);
      doc.text(l.text, left, y);
      y += 5.2;
    }
    y += 4;
  }
  if (day.remarks) {
    const rem = doc.splitTextToSize(plain(day.remarks), width) as string[];
    ensure(rem.length * 5 + 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("REMARKS:", left, y);
    y += 5.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    for (const r of rem) {
      doc.text(r, left, y);
      y += 5;
    }
  }
  const file = `Jadual Driver & Operation ${day.date}.pdf`;
  if (mode === "download") doc.save(file);
  else {
    doc.autoPrint();
    window.open(String(doc.output("bloburl")), "_blank");
  }
}
