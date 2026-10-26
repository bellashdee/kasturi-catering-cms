"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordStockMovement } from "@/lib/kitchen/actions";
import { MOVEMENT_TYPE_LABEL } from "@/lib/kitchen/constants";
import { Select } from "@/components/ui/Select";

type Ingredient = { id: string; name: string; unit_of_measure: string | null; company_id: string };

const inputClass = "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

export function StockMovementForm({
  companyId,
  ingredients,
  fixedIngredientId,
  onSaved,
}: {
  companyId: string;
  ingredients: Ingredient[];
  fixedIngredientId?: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [ingredientId, setIngredientId] = useState(fixedIngredientId ?? ingredients[0]?.id ?? "");
  const [movementType, setMovementType] = useState<"in" | "out" | "adjustment" | "wastage">("adjustment");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ingredientId || !quantity) {
      setError("Ingredient and quantity are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await recordStockMovement({
        companyId,
        ingredientId,
        movementType,
        quantity: Number(quantity),
        notes: notes || undefined,
      });
      setQuantity("");
      setNotes("");
      if (onSaved) onSaved();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">{error}</div>}
      <div className="grid grid-cols-3 gap-3">
        {!fixedIngredientId && (
          <div>
            <label className={labelClass}>Ingredient *</label>
            <Select value={ingredientId} onChange={(e) => setIngredientId(e.target.value)} className={inputClass}>
              {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </Select>
          </div>
        )}
        <div>
          <label className={labelClass}>Movement Type *</label>
          <Select value={movementType} onChange={(e) => setMovementType(e.target.value as typeof movementType)} className={inputClass}>
            <option value="adjustment">{MOVEMENT_TYPE_LABEL.adjustment} (set stock to this count)</option>
            <option value="in">{MOVEMENT_TYPE_LABEL.in} (add to stock)</option>
            <option value="out">{MOVEMENT_TYPE_LABEL.out} (deduct from stock)</option>
            <option value="wastage">{MOVEMENT_TYPE_LABEL.wastage} (deduct — spoiled/thrown out)</option>
          </Select>
        </div>
        <div>
          <label className={labelClass}>Quantity *</label>
          <input type="number" min="0" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
        </div>
      </div>
      <div>
        <label className={labelClass}>Notes</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} placeholder="Optional reason or reference" />
      </div>
      <div className="flex justify-end">
        <button type="submit" disabled={saving || !ingredientId} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Save Movement"}
        </button>
      </div>
    </form>
  );
}
