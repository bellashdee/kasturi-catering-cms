"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateSupplierPayments } from "@/lib/finance/paymentActions";

/** "Open payment voucher" for one supplier of the month, or for every supplier that has none yet. */
export function GenerateSupplierPayments({ companyId, periodMonth, supplierId, missing }: { companyId: string; periodMonth: string; supplierId?: string; missing?: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    if (!supplierId && !window.confirm(`Open ${missing} payment voucher${missing === 1 ? "" : "s"} for this month?`)) return;
    setBusy(true);
    setMessage(null);
    const result = await generateSupplierPayments(companyId, periodMonth, supplierId);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setMessage(`${result.created} payment voucher${result.created === 1 ? "" : "s"} opened.${result.skipped > 0 ? ` ${result.skipped} skipped (nothing to pay).` : ""}`);
    router.refresh();
  }

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      {message && <span className="text-[12px] text-text-secondary">{message}</span>}
      <button
        type="button"
        onClick={run}
        disabled={busy || (!supplierId && !missing)}
        className={supplierId ? "h-8 rounded-lg border border-border-strong bg-surface px-3 text-[12.5px] font-semibold text-text hover:bg-surface-alt disabled:opacity-50" : "h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white disabled:opacity-50"}
      >
        {busy ? "Opening..." : supplierId ? "Open voucher" : `Open all payment vouchers (${missing ?? 0})`}
      </button>
    </span>
  );
}
