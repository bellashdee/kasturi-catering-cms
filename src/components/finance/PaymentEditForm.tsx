"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updatePayment, type DuplicateHit, type PaymentInput } from "@/lib/finance/paymentActions";
import { accountDisplay, type PaymentCategory } from "@/lib/finance/payments";
import { Select } from "@/components/ui/Select";

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const readonlyClass = "mt-1.5 flex h-10 w-full items-center rounded-lg border border-border bg-bg px-3 text-sm text-text-secondary";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

type Initial = {
  companyId: string;
  companyName: string;
  category: PaymentCategory;
  payeeName: string;
  bankName: string;
  accountNo: string;
  paymentOf: string;
  periodMonth: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  priority: "" | "high" | "medium" | "low";
  amount: string;
  voucherNumber: string;
  remarks: string;
  /** "paid" shows the Actual Payment Date box */
  status: string;
  paidDate: string;
  paymentReference: string;
  utilityProvider: string;
  utilityLocation: string;
};

const todayIso = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);

/** Edit a saved payment. Every change (and any bank detail change) is recorded in the audit trail. */
export function PaymentEditForm({ paymentId, initial, redirectTo }: { paymentId: string; initial: Initial; redirectTo: string }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateHit[] | null>(null);

  function set<K extends keyof Initial>(key: K, value: Initial[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDuplicates(null);
  }

  async function submit(e: React.FormEvent, allowDuplicate = false) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: PaymentInput = {
        companyId: form.companyId,
        category: form.category,
        payeeName: form.payeeName,
        bankName: form.bankName || undefined,
        accountNo: form.accountNo || undefined,
        utilityProvider: form.utilityProvider || undefined,
        utilityLocation: form.utilityLocation || undefined,
        paymentOf: form.paymentOf || undefined,
        periodMonth: `${form.periodMonth}-01`,
        invoiceNumber: form.invoiceNumber || undefined,
        invoiceDate: form.invoiceDate || undefined,
        dueDate: form.dueDate || undefined,
        priority: form.priority || undefined,
        amount: Number(form.amount),
        voucherNumber: form.voucherNumber || undefined,
        remarks: form.remarks || undefined,
        paidDate: form.status === "paid" ? form.paidDate : undefined,
        paymentReference: form.status === "paid" ? form.paymentReference : undefined,
      };
      const result = await updatePayment(paymentId, payload, { allowDuplicate });
      if ("duplicates" in result) {
        setDuplicates(result.duplicates);
        setSaving(false);
        return;
      }
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setSaving(false);
    }
  }

  const isSupplier = form.category === "supplier";

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Company (Payment Of)</label>
          <div className={readonlyClass}>{form.companyName}</div>
        </div>
        <div>
          <label className={labelClass}>Payment Month *</label>
          <input type="month" required value={form.periodMonth} onChange={(e) => set("periodMonth", e.target.value)} className={inputClass} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>{form.category === "utility" ? "Location / Account Name" : form.category === "rental" ? "Rental / Payee" : "Pay To (supplier)"} *</label>
          <input required value={form.payeeName} onChange={(e) => set("payeeName", e.target.value)} className={inputClass} />
        </div>
        {isSupplier ? (
          <div>
            <label className={labelClass}>In payment of</label>
            <input value={form.paymentOf} onChange={(e) => set("paymentOf", e.target.value)} className={inputClass} placeholder="e.g. A/C AUGUST 2026" />
          </div>
        ) : (
          <div>
            <label className={labelClass}>{form.category === "utility" ? "Utility Provider" : "Account No."}</label>
            <div className={readonlyClass}>{form.category === "utility" ? form.utilityProvider || "—" : accountDisplay(form.accountNo)}</div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Bank Name</label>
          <input value={form.bankName} onChange={(e) => set("bankName", e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{form.category === "utility" ? "Account No." : "Bank Account Number"}</label>
          <input value={form.accountNo} onChange={(e) => set("accountNo", e.target.value)} className={inputClass} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>{form.category === "utility" ? "Bill Number" : "Invoice Number"}</label>
          <input value={form.invoiceNumber} onChange={(e) => set("invoiceNumber", e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{form.category === "utility" ? "Bill Date" : "Invoice Date"}</label>
          <input type="date" value={form.invoiceDate} onChange={(e) => set("invoiceDate", e.target.value)} className={inputClass} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Amount to Pay (RM) *</label>
          <input type="number" step="0.01" min="0" required value={form.amount} onChange={(e) => set("amount", e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Due Date</label>
          <input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} className={inputClass} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Priority</label>
          <Select value={form.priority} onChange={(e) => set("priority", e.target.value as Initial["priority"])} className={inputClass}>
            <option value="">Not set</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
        </div>
        <div>
          <label className={labelClass}>Payment Voucher No.</label>
          <input value={form.voucherNumber} onChange={(e) => set("voucherNumber", e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Remarks</label>
          <input value={form.remarks} onChange={(e) => set("remarks", e.target.value)} className={inputClass} />
        </div>
      </div>

      {form.status === "paid" && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Actual Payment Date *</label>
            <input type="date" required max={todayIso()} value={form.paidDate} onChange={(e) => set("paidDate", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Payment Reference</label>
            <input value={form.paymentReference} maxLength={200} onChange={(e) => set("paymentReference", e.target.value)} className={inputClass} />
          </div>
        </div>
      )}

      {duplicates && duplicates.length > 0 && (
        <div className="rounded-lg border border-danger/30 bg-danger-bg p-3">
          <div className="text-[13px] font-bold text-danger">These changes would duplicate an existing payment:</div>
          {duplicates.map((d) => <div key={d.id} className="mt-1 text-xs text-danger">{d.label}</div>)}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-secondary">
            <button type="button" disabled={saving} onClick={(e) => void submit(e, true)} className="rounded-lg border border-danger px-3 py-1.5 text-[12.5px] font-bold text-danger disabled:opacity-60">
              Save anyway (it is a separate invoice)
            </button>
            <span>Only when it really is a different invoice of the same supplier.</span>
          </div>
        </div>
      )}

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">Cancel</button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">{saving ? "Saving..." : "Save Changes"}</button>
      </div>
    </form>
  );
}
