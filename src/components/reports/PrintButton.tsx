"use client";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="h-9 rounded-lg border border-border-strong bg-surface px-4 text-[13px] font-semibold text-text">
      Export PDF
    </button>
  );
}
