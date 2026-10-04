"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDocument, fileTypeFromMime, ANY_UPLOAD_ACCEPT } from "@/lib/documents/upload";
import { recordPaymentExecution } from "@/lib/procurement/actions";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PaymentExecutionForm({ paymentId, companyId }: { paymentId: string; companyId: string }) {
  const router = useRouter();
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      let receiptDocumentId: string | undefined;
      if (receipt) {
        const doc = await uploadDocument({ companyId, module: "supplier-procurement", fileType: fileTypeFromMime(receipt), file: receipt });
        receiptDocumentId = doc.id;
      }
      await recordPaymentExecution(paymentId, {
        paymentDate,
        paymentMethod,
        referenceNumber: referenceNumber || undefined,
        receiptDocumentId,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-border bg-surface-alt p-4">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">{error}</div>}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Payment Date *</label>
          <input type="date" required value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]" />
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Payment Method *</label>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]">
            <option value="bank_transfer">Bank Transfer</option>
            <option value="cheque">Cheque</option>
            <option value="cash">Cash</option>
            <option value="online_banking">Online Banking</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Reference Number</label>
          <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]" />
        </div>
      </div>
      <div>
        <label className="text-[12px] font-semibold text-text-secondary">Receipt (optional)</label>
        <input type="file" accept={ANY_UPLOAD_ACCEPT} onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-[13px]" />
      </div>
      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2 text-[13px] font-bold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Mark as Paid"}
        </button>
      </div>
    </form>
  );
}
