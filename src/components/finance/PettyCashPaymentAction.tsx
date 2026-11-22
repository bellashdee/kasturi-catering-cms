"use client";

import { Select } from "@/components/ui/Select";
import { todayInMalaysia } from "@/lib/format";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { markPettyCashPaid, updatePettyCashPayment } from "@/lib/finance/actions";
import { PAYMENT_METHOD_LABEL } from "@/lib/operationPettyCash/constants";

/** What was saved when the claim was marked as paid, to correct it. */
type Paid = { paymentDate: string | null; paymentMethod: string | null; paymentReference: string | null; paymentRemarks: string | null };

/**
 * Mark as Paid for a claim waiting for payment; for a claim already paid, Change payment corrects how it was paid (cash or online
 * transfer), the date, the reference and the remarks.
 */
export function PettyCashPaymentAction({ transactionId, paymentStatus, paid }: { transactionId: string; paymentStatus: string; paid?: Paid }) {
  const router = useRouter();
  const editing = paymentStatus === "paid";
  const [open, setOpen] = useState(false);
  const [paymentDate, setPaymentDate] = useState((editing && paid?.paymentDate) || todayInMalaysia());
  const [paymentMethod, setPaymentMethod] = useState((editing && paid?.paymentMethod) || "");
  const [paymentReference, setPaymentReference] = useState((editing && paid?.paymentReference) || "");
  const [paymentRemarks, setPaymentRemarks] = useState((editing && paid?.paymentRemarks) || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (paymentStatus !== "pending_payment" && !editing) {
    return <span className="text-[12px] text-text-muted">—</span>;
  }

  if (!open) {
    return editing ? (
      <button onClick={() => setOpen(true)} className="rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-xs font-semibold text-text">
        Change payment
      </button>
    ) : (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-white">
        Mark as Paid
      </button>
    );
  }

  async function confirm() {
    setSaving(true);
    setError(null);
    const input = { transactionId, paymentDate, paymentMethod, paymentReference: paymentReference || undefined, paymentRemarks: paymentRemarks || undefined };
    try {
      if (editing) {
        const r = await updatePettyCashPayment(input);
        if (!r.ok) {
          setError(r.error);
          return;
        }
      } else {
        await markPettyCashPaid(input);
      }
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
      <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{editing ? "Change the payment" : "Director of Finance — Mark Paid"}</div>
      {error && <div className="text-[11px] text-danger">{error}</div>}
      <div>
        <label className="text-[11px] font-semibold text-text-secondary">Payment Date *</label>
        <input type="date" required value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="mt-0.5 h-8 w-full rounded-md border border-border-strong px-2 text-[12.5px]" />
      </div>
      <div>
        <label className="text-[11px] font-semibold text-text-secondary">Claim paid by *</label>
        <Select required value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="mt-0.5 h-8 w-full rounded-md border border-border-strong bg-white px-2 text-[12.5px]">
          <option value="">Cash or online transfer</option>
          {Object.entries(PAYMENT_METHOD_LABEL).map(([value, text]) => (
            <option key={value} value={value}>{text}</option>
          ))}
        </Select>
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
        <button onClick={confirm} disabled={saving || !paymentDate || !paymentMethod} className="rounded-md bg-success px-3 py-1 text-[12px] font-bold text-white disabled:opacity-50">
          {saving ? "Saving..." : editing ? "Save changes" : "Confirm Paid"}
        </button>
      </div>
    </div>
  );
}
