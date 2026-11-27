"use client";

import { useState } from "react";
import { printPaymentProof, type ProofPrintDetails } from "@/lib/finance/printProof";

/** Prints the payment proof file (with the payment details on top when it is a picture). */
export function PrintProofButton({ proofId, details, variant = "link" }: { proofId: string; details: ProofPrintDetails; variant?: "link" | "button" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const print = async () => {
    setBusy(true);
    setError(null);
    const r = await printPaymentProof(proofId, details);
    setBusy(false);
    if (!r.ok) setError(r.error ?? "Could not print the proof.");
  };
  const cls =
    variant === "button"
      ? "h-10 rounded-lg border border-border-strong bg-surface px-4 text-[14px] font-semibold text-text disabled:opacity-60"
      : "text-[13px] font-semibold text-primary hover:underline disabled:opacity-60";
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={print} disabled={busy} className={cls}>
        {busy ? "Preparing..." : "Print proof"}
      </button>
      {error && <span className="text-[12px] text-danger">{error}</span>}
    </span>
  );
}
