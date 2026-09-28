"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProductionOrder, type ProductionOrderInput } from "@/lib/kitchen/actions";

type Company = { id: string; name: string };
type Recipe = { id: string; name: string; yield_pax: number; company_id: string };

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

export function ProductionOrderForm({ companies, defaultCompanyId, recipes }: { companies: Company[]; defaultCompanyId?: string; recipes: Recipe[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [recipeId, setRecipeId] = useState("");
  const [paxCount, setPaxCount] = useState("");
  const [plannedDate, setPlannedDate] = useState("");
  const [notes, setNotes] = useState("");

  const recipesForCompany = recipes.filter((r) => r.company_id === companyId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload: ProductionOrderInput = {
      companyId,
      recipeId: recipeId || undefined,
      paxCount: paxCount ? Number(paxCount) : undefined,
      plannedDate,
      notes: notes || undefined,
    };
    try {
      const created = await createProductionOrder(payload);
      router.push(`/kitchen/${created.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Company *</label>
          <select required value={companyId} onChange={(e) => { setCompanyId(e.target.value); setRecipeId(""); }} className={inputClass}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Planned Date *</label>
          <input type="date" required value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Recipe</label>
          <select value={recipeId} onChange={(e) => setRecipeId(e.target.value)} className={inputClass}>
            <option value="">Not linked to a recipe yet</option>
            {recipesForCompany.map((r) => <option key={r.id} value={r.id}>{r.name} (base yield {r.yield_pax} pax)</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Pax to Produce</label>
          <input type="number" min="1" value={paxCount} onChange={(e) => setPaxCount(e.target.value)} className={inputClass} placeholder="Leave blank to use recipe's base yield" />
        </div>
      </div>

      <div>
        <label className={labelClass}>Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1.5 h-20 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none" />
      </div>

      <p className="text-xs text-text-muted">
        Recipe + Pax will scale the ingredient list once you open this order — required ingredients are only deducted from stock when the order is marked Completed.
      </p>

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving || !plannedDate} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Create Production Order"}
        </button>
      </div>
    </form>
  );
}
