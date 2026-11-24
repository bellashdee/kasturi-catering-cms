"use client";

import { useState } from "react";
import { downloadSoaPdf, openSoaPdf } from "@/lib/procurement/soaPdf";
import type { SoaStatement } from "@/lib/procurement/soa";

const buttonClass = "h-9 rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-text hover:bg-surface-alt disabled:opacity-50 print:hidden";

/** "View PDF" and "Download PDF" of one or many supplier statements (many = one PDF, each supplier starting on a new page). */
export function SoaPrintButtons({ statements, filename, viewLabel = "View PDF", downloadLabel = "Download PDF" }: { statements: SoaStatement[]; filename: string; viewLabel?: string; downloadLabel?: string }) {
  const [busy, setBusy] = useState(false);
  const empty = statements.length === 0;
  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={empty}
        // the window is opened by the click itself so that a pop-up blocker lets it through
        onClick={() => openSoaPdf(statements, window.open("", "_blank"))}
        className={buttonClass}
      >
        {viewLabel}
      </button>
      <button
        type="button"
        disabled={empty || busy}
        onClick={() => {
          setBusy(true);
          try {
            downloadSoaPdf(statements, filename);
          } finally {
            setBusy(false);
          }
        }}
        className={`${buttonClass} !border-primary !bg-primary !text-white`}
      >
        {downloadLabel}
      </button>
    </div>
  );
}
