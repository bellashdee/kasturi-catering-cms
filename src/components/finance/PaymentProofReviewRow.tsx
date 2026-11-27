"use client";

import { reserveTab } from "@/lib/openTab";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { approvePaymentProof, getPaymentProofUrl, rejectPaymentProof } from "@/lib/finance/paymentProofActions";
import { formatPrice } from "@/lib/format";
import { Select } from "@/components/ui/Select";
import { PrintProofButton } from "@/components/finance/PrintProofButton";
import type { ProofPrintDetails } from "@/lib/finance/printProof";

export type InvoiceOption = { id: string; label: string; outstanding: number };

/** One pending proof: look at it, choose / confirm the invoice, the amount and the date, then approve (records the payment) or reject. */
export function PaymentProofReviewRow({
  proofId,
  matchedInvoiceId,
  hasProof = true,
  options,
  defaultAmount,
  defaultDate,
  today,
  printDetails,
}: {
  proofId: string;
  matchedInvoiceId: string | null;
  hasProof?: boolean;
  options: InvoiceOption[];
  defaultAmount: number | null;
  defaultDate: string;
  today: string;
  printDetails?: ProofPrintDetails;
}) {
  const router = useRouter();
  const [invoiceId, setInvoiceId] = useState(matchedInvoiceId ?? "");
  const chosen = options.find((o) => o.id === invoiceId);
  const [amount, setAmount] = useState(defaultAmount !== null ? String(defaultAmount) : chosen ? String(chosen.outstanding) : "");
  const [date, setDate] = useState(defaultDate);
  const [busy, setBusy] = useState<"view" | "approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pickInvoice(id: string) {
    setInvoiceId(id);
    const o = options.find((x) => x.id === id);
    if (o && defaultAmount === null) setAmount(String(o.outstanding));
  }

  async function view() {
    const tab = reserveTab();
    setBusy("view");
    setError(null);
    const r = await getPaymentProofUrl(proofId);
    setBusy(null);
    if (r.ok && r.url) tab.go(r.url);
    else {
      tab.cancel();
      setError(r.error ?? "Could not open the proof file.");
    }
  }

  async function approve() {
    setBusy("approve");
    setError(null);
    const r = await approvePaymentProof(proofId, { customerInvoiceId: invoiceId, amount: Number(amount), paymentDate: date });
    setBusy(null);
    if (!r.ok) setError(r.error ?? "Could not approve.");
    else router.refresh();
  }

  async function reject() {
    const note = window.prompt("Reason for rejecting (optional):") ;
    if (note === null) return;
    setBusy("reject");
    setError(null);
    const r = await rejectPaymentProof(proofId, note);
    setBusy(null);
    if (!r.ok) setError(r.error ?? "Could not reject.");
    else router.refresh();
  }

  const field = "h-10 rounded-lg border border-border-strong bg-surface px-2.5 text-[14px] text-text";
  return (
    <div className="mt-3 flex flex-col gap-3 rounded-lg border border-border bg-surface-alt p-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <label className="text-[12.5px] font-semibold text-text-secondary">Customer invoice</label>
          <Select value={invoiceId} onChange={(e) => pickInvoice(e.target.value)} className={`${field} mt-1 block w-full`}>
            <option value="">{matchedInvoiceId ? "—" : "Choose the invoice this payment is for"}</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </Select>
          {chosen && <div className="mt-1 text-[12.5px] text-text-secondary">Still to be paid: <b className="text-text">{formatPrice(chosen.outstanding)}</b></div>}
        </div>
        <div>
          <label className="text-[12.5px] font-semibold text-text-secondary">Amount paid (RM)</label>
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} mt-1 block w-full`} />
        </div>
        <div>
          <label className="text-[12.5px] font-semibold text-text-secondary">Payment date</label>
          <input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} className={`${field} mt-1 block w-full`} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {hasProof && (
          <button type="button" onClick={view} disabled={busy !== null} className="h-10 rounded-lg border border-border-strong bg-surface px-4 text-[14px] font-semibold text-text disabled:opacity-60">
            {busy === "view" ? "Opening..." : "View proof"}
          </button>
        )}
        {hasProof && printDetails && <PrintProofButton proofId={proofId} details={printDetails} variant="button" />}
        <button type="button" onClick={approve} disabled={busy !== null || !invoiceId || !(Number(amount) > 0)} className="h-10 rounded-lg bg-primary px-4 text-[14px] font-semibold text-white disabled:opacity-50">
          {busy === "approve" ? "Recording..." : "Approve & record payment"}
        </button>
        <button type="button" onClick={reject} disabled={busy !== null} className="h-10 rounded-lg border border-danger/40 bg-surface px-4 text-[14px] font-semibold text-danger disabled:opacity-60">
          Reject
        </button>
        {error && <span className="text-[13px] font-semibold text-danger">{error}</span>}
      </div>
    </div>
  );
}
