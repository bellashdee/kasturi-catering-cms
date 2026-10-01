"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markCustomerInvoicePaid } from "@/lib/finance/actions";
import { markSupplierInvoicePaid } from "@/lib/procurement/actions";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function MarkInvoicePaidAction({ kind, invoiceId }: { kind: "customer" | "supplier"; invoiceId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentRemarks, setPaymentRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      if (kind === "customer") {
        await markCustomerInvoicePaid({ customerInvoiceId: invoiceId, paymentDate, paymentReference: paymentReference || undefined, paymentRemarks: paymentRemarks || undefined });
      } else {
        await markSupplierInvoicePaid({ supplierInvoiceId: invoiceId, paymentDate, paymentReference: paymentReference || undefined, paymentRemarks: paymentRemarks || undefined });
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg border border-success/40 px-3 py-1.5 text-xs font-bold text-success">
        ☐ Mark Paid
      </button>
    );
  }

  return (
    <div className="relative">
      <div className="absolute right-0 top-0 z-10 w-64 rounded-lg border border-border bg-surface p-3 shadow-lg">
        <div className="mb-2 text-[12.5px] font-bold text-text">Confirm Payment Received</div>
        {error && <div className="mb-2 rounded-lg border border-danger/30 bg-danger-bg px-2 py-1.5 text-xs text-danger">{error}</div>}
        <label className="text-[11px] font-semibold text-text-secondary">Payment Date</label>
        <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="mt-1 h-8 w-full rounded-lg border border-border-strong px-2 text-[12.5px]" />
        <label className="mt-2 block text-[11px] font-semibold text-text-secondary">Reference (optional)</label>
        <input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className="mt-1 h-8 w-full rounded-lg border border-border-strong px-2 text-[12.5px]" />
        <label className="mt-2 block text-[11px] font-semibold text-text-secondary">Remarks (optional)</label>
        <input value={paymentRemarks} onChange={(e) => setPaymentRemarks(e.target.value)} className="mt-1 h-8 w-full rounded-lg border border-border-strong px-2 text-[12.5px]" />
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-semibold text-text">
            Cancel
          </button>
          <button type="button" disabled={saving} onClick={confirm} className="rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">
            {saving ? "Saving..." : "Confirm Paid"}
          </button>
        </div>
      </div>
    </div>
  );
}
