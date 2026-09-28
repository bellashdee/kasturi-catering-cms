"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createIngredient, updateIngredient, type IngredientInput } from "@/lib/kitchen/actions";

type Company = { id: string; name: string };
type Supplier = { id: string; name: string; company_id: string };

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

export function IngredientForm({
  companies,
  defaultCompanyId,
  suppliers,
  ingredientId,
  initial,
}: {
  companies: Company[];
  defaultCompanyId?: string;
  suppliers: Supplier[];
  ingredientId?: string;
  initial?: Partial<IngredientInput>;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(initial?.companyId ?? defaultCompanyId ?? companies[0]?.id ?? "");
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    unitOfMeasure: initial?.unitOfMeasure ?? "kg",
    currentStockQty: String(initial?.currentStockQty ?? 0),
    reorderLevel: String(initial?.reorderLevel ?? 0),
    unitCost: String(initial?.unitCost ?? 0),
    preferredSupplierId: initial?.preferredSupplierId ?? "",
  });

  const suppliersForCompany = suppliers.filter((s) => s.company_id === companyId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload: IngredientInput = {
      companyId,
      name: form.name,
      unitOfMeasure: form.unitOfMeasure || undefined,
      currentStockQty: Number(form.currentStockQty) || 0,
      reorderLevel: Number(form.reorderLevel) || 0,
      unitCost: Number(form.unitCost) || 0,
      preferredSupplierId: form.preferredSupplierId || undefined,
    };
    try {
      if (ingredientId) {
        await updateIngredient(ingredientId, payload);
        router.push(`/kitchen/ingredients/${ingredientId}`);
      } else {
        const created = await createIngredient(payload);
        router.push(`/kitchen/ingredients/${created.id}`);
      }
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
          <select required value={companyId} onChange={(e) => { setCompanyId(e.target.value); setForm((f) => ({ ...f, preferredSupplierId: "" })); }} disabled={!!ingredientId} className={inputClass}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Ingredient Name *</label>
          <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputClass} placeholder="e.g. Basmati Rice" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Unit of Measure</label>
          <select value={form.unitOfMeasure} onChange={(e) => setForm((f) => ({ ...f, unitOfMeasure: e.target.value }))} className={inputClass}>
            <option value="kg">kg</option>
            <option value="g">g</option>
            <option value="l">l</option>
            <option value="ml">ml</option>
            <option value="pcs">pcs</option>
            <option value="pack">pack</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Preferred Supplier</label>
          <select value={form.preferredSupplierId} onChange={(e) => setForm((f) => ({ ...f, preferredSupplierId: e.target.value }))} className={inputClass}>
            <option value="">None</option>
            {suppliersForCompany.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {!ingredientId && (
          <div>
            <label className={labelClass}>Current Stock</label>
            <input type="number" min="0" step="0.01" value={form.currentStockQty} onChange={(e) => setForm((f) => ({ ...f, currentStockQty: e.target.value }))} className={inputClass} />
          </div>
        )}
        <div>
          <label className={labelClass}>Reorder Level</label>
          <input type="number" min="0" step="0.01" value={form.reorderLevel} onChange={(e) => setForm((f) => ({ ...f, reorderLevel: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Unit Cost (RM)</label>
          <input type="number" min="0" step="0.01" value={form.unitCost} onChange={(e) => setForm((f) => ({ ...f, unitCost: e.target.value }))} className={inputClass} />
        </div>
      </div>

      {ingredientId && (
        <p className="text-xs text-text-muted">
          To change stock on hand, use &quot;Adjust Stock&quot; on this ingredient&apos;s page instead — that keeps the stock movement ledger accurate.
        </p>
      )}

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : ingredientId ? "Save Changes" : "Add Ingredient"}
        </button>
      </div>
    </form>
  );
}
