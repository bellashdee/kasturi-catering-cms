"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSplitMonthlySales } from "@/lib/finance/actions";
import { formatCurrency } from "@/lib/format";

/** Signature Solution's sales for the month, kept in two parts: catering events and daily sales. */
export function SplitSalesForm({
  companyId,
  year,
  month,
  monthLabel,
  current,
  earlierTotal,
}: {
  companyId: string;
  year: number;
  month: number;
  monthLabel: string;
  current: { catering: number; daily: number } | null;
  earlierTotal: number | null;
}) {
  const router = useRouter();
  const [catering, setCatering] = useState(current ? String(current.catering) : "");
  const [daily, setDaily] = useState(current ? String(current.daily) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const total = (Number(catering) || 0) + (Number(daily) || 0);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await saveSplitMonthlySales({ companyId, year, month, cateringAmount: Number(catering), dailyAmount: Number(daily) });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save sales.");
    } finally {
      setSaving(false);
    }
  }

  const input = "mt-1 h-9 w-48 rounded-lg border border-border-strong px-2 text-[13px]";

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Signature Solution Catering – {monthLabel} {year} (RM)</label>
          <input type="number" step="0.01" min="0" required value={catering} onChange={(e) => setCatering(e.target.value)} className={input} />
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Signature Solution Sdn Bhd (daily) – {monthLabel} {year} (RM)</label>
          <input type="number" step="0.01" min="0" required value={daily} onChange={(e) => setDaily(e.target.value)} className={input} />
        </div>
        <div className="pb-1.5 text-[13px] text-text-secondary">
          Total <span className="font-extrabold text-text">{formatCurrency(total)}</span>
        </div>
        <button type="submit" disabled={saving} className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white disabled:opacity-50">
          {saving ? "Saving…" : current ? "Update Sales" : "Save Sales"}
        </button>
        {saved && <span className="text-[12.5px] font-semibold text-success">Saved</span>}
        {error && <span className="text-[12.5px] font-semibold text-danger">{error}</span>}
      </div>
      {!current && earlierTotal !== null && (
        <p className="text-[12px] text-text-muted">
          A single total of {formatCurrency(earlierTotal)} was entered earlier for this month. Saving the two figures above replaces it.
        </p>
      )}
    </form>
  );
}
