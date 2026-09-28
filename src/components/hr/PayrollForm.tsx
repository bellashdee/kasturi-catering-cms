"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createPayrollRecord } from "@/lib/hr/actions";
import { formatCurrency } from "@/lib/format";

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

export function PayrollForm({ employeeId, companyId }: { employeeId: string; companyId: string }) {
  const router = useRouter();
  const [payPeriodStart, setPayPeriodStart] = useState("");
  const [payPeriodEnd, setPayPeriodEnd] = useState("");
  const [grossPay, setGrossPay] = useState("");
  const [deductions, setDeductions] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const netPay = useMemo(() => {
    const g = Number(grossPay) || 0;
    const d = Number(deductions) || 0;
    return g - d;
  }, [grossPay, deductions]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createPayrollRecord({
        employeeId,
        companyId,
        payPeriodStart,
        payPeriodEnd,
        grossPay: Number(grossPay),
        deductions: Number(deductions) || 0,
      });
      router.push(`/hr/${employeeId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Pay Period Start *</label>
          <input type="date" required value={payPeriodStart} onChange={(e) => setPayPeriodStart(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Pay Period End *</label>
          <input type="date" required value={payPeriodEnd} onChange={(e) => setPayPeriodEnd(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Gross Pay (RM) *</label>
          <input type="number" step="0.01" min="0" required value={grossPay} onChange={(e) => setGrossPay(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Deductions (RM)</label>
          <input type="number" step="0.01" min="0" value={deductions} onChange={(e) => setDeductions(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="text-[13px] text-text-secondary">Net pay: <b className="text-text">{formatCurrency(netPay)}</b></div>

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Add Payroll Record"}
        </button>
      </div>
    </form>
  );
}
