"use client";

import { todayInMalaysia } from "@/lib/format";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { markPettyCashPaid } from "@/lib/finance/actions";

function todayIso(): string {
  return todayInMalaysia();
}

export function PettyCashPaymentAction({ transactionId, paymentStatus }: { transactionId: string; paymentStatus: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentRemarks, setPaymentRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (paymentStatus !== "pending_payment") {
    return <span className="text-[12px] text-text-muted">—</span>;
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-white">
        Mark as Paid
      </button>
    );
  }

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      await markPettyCashPaid({ transactionId, paymentDate, paymentReference: paymentReference || undefined, paymentRemarks: paymentRemarks || undefined });
      router.refresh();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex w-56 flex-col gap-2 rounded-lg border border-border bg-white p-3 text-left shadow-lg">
      <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Director of Finance — Mark Paid</div>
      {error && <div className="text-[11px] text-danger">{error}</div>}
      <div>
        <label className="text-[11px] font-semibold text-text-secondary">Payment Date *</label>
        <input type="date" required value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="mt-0.5 h-8 w-full rounded-md border border-border-strong px-2 text-[12.5px]" />
      </div>
      <div>
        <label className="text-[11px] font-semibold text-text-secondary">Payment Reference (optional)</label>
        <input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className="mt-0.5 h-8 w-full rounded-md border border-border-strong px-2 text-[12.5px]" />
      </div>
      <div>
        <label className="text-[11px] font-semibold text-text-secondary">Remarks (optional)</label>
        <input value={paymentRemarks} onChange={(e) => setPaymentRemarks(e.target.value)} className="mt-0.5 h-8 w-full rounded-md border border-border-strong px-2 text-[12.5px]" />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={() => setOpen(false)} disabled={saving} className="rounded-md px-2.5 py-1 text-[12px] font-semibold text-text-secondary">
          Cancel
        </button>
        <button onClick={confirm} disabled={saving || !paymentDate} className="rounded-md bg-success px-3 py-1 text-[12px] font-bold text-white disabled:opacity-50">
          {saving ? "Saving..." : "Confirm Paid"}
        </button>
      </div>
    </div>
  );
}
