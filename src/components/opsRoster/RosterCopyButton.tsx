"use client";

import { useState } from "react";
import { whatsappText, type DayRoster, type RosterStaff } from "@/lib/opsRoster/shared";
import { dayRosterPdf } from "@/components/opsRoster/rosterExport";

/** For the read-only view: copy the day in WhatsApp format, download the PDF or print it. */
export function RosterCopyButton({ day, staff }: { day: DayRoster; staff: RosterStaff[] }) {
  const [done, setDone] = useState<string | null>(null);
  const btn = "h-9 rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-text hover:bg-surface-alt";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(whatsappText(day, staff));
            setDone("Copied. Paste it in WhatsApp.");
          } catch {
            setDone("Could not copy on this device.");
          }
        }}
        className="h-9 rounded-lg bg-[#25D366] px-3.5 text-[13px] font-bold text-white"
      >
        Copy to WhatsApp
      </button>
      <button type="button" onClick={() => dayRosterPdf(day, staff, "download")} className={btn}>Download PDF</button>
      <button type="button" onClick={() => dayRosterPdf(day, staff, "print")} className={btn}>Print A4</button>
      {done && <span className="text-[12.5px] text-success">{done}</span>}
    </div>
  );
}
