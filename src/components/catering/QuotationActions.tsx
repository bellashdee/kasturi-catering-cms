"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateQuotationStatus, updateQuotationPaymentStatus } from "@/lib/catering/actions";
import { Select } from "@/components/ui/Select";

export function QuotationActions({ quotationId, status, paymentStatus }: { quotationId: string; status: string; paymentStatus: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<void>) {
    setPending(true);
    try {
      await action();
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {status === "draft" && (
        <button disabled={pending} onClick={() => run(() => updateQuotationStatus(quotationId, "sent"))} className="rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-xs font-bold text-text disabled:opacity-50">
          Mark Sent
        </button>
      )}
      {(status === "draft" || status === "sent") && (
        <>
          <button disabled={pending} onClick={() => run(() => updateQuotationStatus(quotationId, "accepted"))} className="rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
            Accept
          </button>
          <button disabled={pending} onClick={() => run(() => updateQuotationStatus(quotationId, "rejected"))} className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-bold text-danger disabled:opacity-50">
            Reject
          </button>
        </>
      )}
      {status === "accepted" && (
        <Select
          value={paymentStatus}
          disabled={pending}
          onChange={(e) => run(() => updateQuotationPaymentStatus(quotationId, e.target.value))}
          className="h-8 rounded-lg border border-border-strong px-2 text-xs disabled:opacity-50"
        >
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partially Paid</option>
          <option value="paid">Paid</option>
        </Select>
      )}
    </div>
  );
}
