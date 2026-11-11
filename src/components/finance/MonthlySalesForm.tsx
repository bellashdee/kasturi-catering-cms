"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveMonthlySales } from "@/lib/finance/actions";

export function MonthlySalesForm({
  companyId,
  year,
  month,
  monthLabel,
  currentAmount,
  label,
}: {
  companyId: string;
  year: number;
  month: number;
  monthLabel: string;
  currentAmount: number | null;
  /** Shown instead of "Total sales for <month> <year> (RM)", e.g. the company name when several companies are listed. */
  label?: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(currentAmount === null ? "" : String(currentAmount));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await saveMonthlySales({ companyId, year, month, salesAmount: Number(amount) });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save sales.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-2.5">
        <label className="whitespace-nowrap text-[12px] font-semibold text-text-secondary">{label ?? `Total sales for ${monthLabel} ${year} (RM)`}</label>
        <input
          type="number"
          step="0.01"
          min="0"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-9 w-48 rounded-lg border border-border-strong px-2 text-[13px]"
        />
      </div>
      <button type="submit" disabled={saving} className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white disabled:opacity-50">
        {saving ? "Saving…" : currentAmount === null ? "Save Sales" : "Update Sales"}
      </button>
      {saved && <span className="text-[12.5px] font-semibold text-success">Saved</span>}
      {error && <span className="text-[12.5px] font-semibold text-danger">{error}</span>}
    </form>
  );
}
