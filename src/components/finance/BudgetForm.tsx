"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBudget } from "@/lib/finance/actions";
import { MONTH_LABEL } from "@/lib/finance/constants";

type Company = { id: string; name: string };
type CostCategory = { id: string; name: string };

function currentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function BudgetForm({ companies, defaultCompanyId, categories }: { companies: Company[]; defaultCompanyId?: string; categories: CostCategory[] }) {
  const router = useRouter();
  const { year: nowYear, month: nowMonth } = currentYearMonth();
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [department, setDepartment] = useState("");
  const [category, setCategory] = useState(categories[0]?.name ?? "Other");
  const [year, setYear] = useState(String(nowYear));
  const [month, setMonth] = useState(String(nowMonth));
  const [budgetedAmount, setBudgetedAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createBudget({
        companyId,
        department: department || undefined,
        category,
        year: Number(year),
        month: Number(month),
        budgetedAmount: Number(budgetedAmount) || 0,
        notes: notes || undefined,
      });
      router.push("/finance-admin/budgets");
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
          <label className="text-[12.5px] font-semibold text-text-secondary">Company *</label>
          <select required value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none">
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[12.5px] font-semibold text-text-secondary">Department</label>
          <input value={department} onChange={(e) => setDepartment(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none" placeholder="Optional — leave blank for company-wide" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-[12.5px] font-semibold text-text-secondary">Category *</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none">
            {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[12.5px] font-semibold text-text-secondary">Year *</label>
          <input type="number" required value={year} onChange={(e) => setYear(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none" />
        </div>
        <div>
          <label className="text-[12.5px] font-semibold text-text-secondary">Month *</label>
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none">
            {MONTH_LABEL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="text-[12.5px] font-semibold text-text-secondary">Budgeted Amount (RM) *</label>
        <input type="number" min="0" step="0.01" required value={budgetedAmount} onChange={(e) => setBudgetedAmount(e.target.value)} className="mt-1.5 h-10 w-full max-w-xs rounded-lg border border-border-strong px-3 text-sm outline-none" />
      </div>

      <div>
        <label className="text-[12.5px] font-semibold text-text-secondary">Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1.5 h-16 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none" />
      </div>

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Create Budget"}
        </button>
      </div>
    </form>
  );
}
