"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupplierPayment } from "@/lib/procurement/actions";

export function RequestPaymentForm({ companyId, invoiceId, outstanding }: { companyId: string; invoiceId: string; outstanding: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState(outstanding.toFixed(2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createSupplierPayment({ companyId, supplierInvoiceId: invoiceId, amount: Number(amount) || 0 });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      {error && <div className="w-full rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">{error}</div>}
      <div>
        <label className="text-[12px] font-semibold text-text-secondary">Amount to Request (RM)</label>
        <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 h-9 w-40 rounded-lg border border-border-strong px-2 text-[13px]" />
      </div>
      <button type="submit" disabled={saving || Number(amount) <= 0} className="h-9 rounded-lg bg-primary px-4 text-xs font-bold text-white disabled:opacity-60">
        {saving ? "Submitting..." : "Request Payment"}
      </button>
    </form>
  );
}
