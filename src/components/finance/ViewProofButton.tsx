"use client";

import { useState } from "react";
import { reserveTab } from "@/lib/openTab";
import { getPaymentProofUrl } from "@/lib/finance/paymentProofActions";

/** Opens the payment proof file (receipt / transfer slip) of a reviewed proof in a new tab. */
export function ViewProofButton({ proofId }: { proofId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const view = async () => {
    const tab = reserveTab();
    setBusy(true);
    setError(null);
    const r = await getPaymentProofUrl(proofId);
    setBusy(false);
    if (r.ok && r.url) tab.go(r.url);
    else {
      tab.cancel();
      setError(r.error ?? "Could not open the proof file.");
    }
  };
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={view} disabled={busy} className="text-[13px] font-semibold text-primary hover:underline disabled:opacity-60">
        {busy ? "Opening..." : "View proof"}
      </button>
      {error && <span className="text-[12px] text-danger">{error}</span>}
    </span>
  );
}
