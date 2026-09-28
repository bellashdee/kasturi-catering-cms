"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { upsertCosting } from "@/lib/catering/actions";
import { formatCurrency } from "@/lib/format";

const inputClass = "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

type Costing = {
  food_cost: number;
  ingredient_cost: number;
  staff_cost: number;
  transport_cost: number;
  equipment_cost: number;
  other_cost: number;
  notes: string | null;
};

export function CostingForm({ companyId, eventId, revenue, initial }: { companyId: string; eventId: string; revenue: number; initial: Costing | null }) {
  const router = useRouter();
  const [foodCost, setFoodCost] = useState(String(initial?.food_cost ?? 0));
  const [ingredientCost, setIngredientCost] = useState(String(initial?.ingredient_cost ?? 0));
  const [staffCost, setStaffCost] = useState(String(initial?.staff_cost ?? 0));
  const [transportCost, setTransportCost] = useState(String(initial?.transport_cost ?? 0));
  const [equipmentCost, setEquipmentCost] = useState(String(initial?.equipment_cost ?? 0));
  const [otherCost, setOtherCost] = useState(String(initial?.other_cost ?? 0));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalCost = useMemo(
    () => [foodCost, ingredientCost, staffCost, transportCost, equipmentCost, otherCost].reduce((t, v) => t + (Number(v) || 0), 0),
    [foodCost, ingredientCost, staffCost, transportCost, equipmentCost, otherCost],
  );
  const margin = revenue - totalCost;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await upsertCosting({
        companyId,
        eventId,
        foodCost: Number(foodCost) || 0,
        ingredientCost: Number(ingredientCost) || 0,
        staffCost: Number(staffCost) || 0,
        transportCost: Number(transportCost) || 0,
        equipmentCost: Number(equipmentCost) || 0,
        otherCost: Number(otherCost) || 0,
        notes: notes || undefined,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Food Cost (RM)</label>
          <input type="number" min="0" step="0.01" value={foodCost} onChange={(e) => setFoodCost(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Ingredient Cost (RM)</label>
          <input type="number" min="0" step="0.01" value={ingredientCost} onChange={(e) => setIngredientCost(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Staff Cost (RM)</label>
          <input type="number" min="0" step="0.01" value={staffCost} onChange={(e) => setStaffCost(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Transport (RM)</label>
          <input type="number" min="0" step="0.01" value={transportCost} onChange={(e) => setTransportCost(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Equipment (RM)</label>
          <input type="number" min="0" step="0.01" value={equipmentCost} onChange={(e) => setEquipmentCost(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Other Costs (RM)</label>
          <input type="number" min="0" step="0.01" value={otherCost} onChange={(e) => setOtherCost(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1.5 h-16 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none" />
      </div>

      <div className="grid grid-cols-3 gap-4 rounded-lg border border-border bg-surface-alt p-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Revenue</div>
          <div className="mt-1 text-lg font-extrabold text-text">{formatCurrency(revenue)}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Total Cost</div>
          <div className="mt-1 text-lg font-extrabold text-text">{formatCurrency(totalCost)}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Margin</div>
          <div className={`mt-1 text-lg font-extrabold ${margin >= 0 ? "text-success" : "text-danger"}`}>{formatCurrency(margin)}</div>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Save Costing"}
        </button>
      </div>
    </form>
  );
}
