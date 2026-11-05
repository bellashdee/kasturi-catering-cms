"use client";

import { printDocument, type PrintDocument } from "@/lib/documents/printDocument";

/** "Print" for a purchase order, invoice or note: the document in the layout of an accounting-system print (A4 PDF). */
export function PrintDocumentButton({ document, label = "Print" }: { document: PrintDocument; label?: string }) {
  return (
    <button
      type="button"
      // the window is opened by the click itself so that a pop-up blocker lets it through
      onClick={() => printDocument(document, window.open("", "_blank"))}
      className="h-9 rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-text hover:bg-surface-alt print:hidden"
    >
      {label}
    </button>
  );
}
