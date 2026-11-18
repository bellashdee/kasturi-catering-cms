"use client";

import { useMemo, useState } from "react";
import { scaleIngredientRequirements, type IngredientRequirement } from "@/lib/kitchen/queries";
import { formatPrice } from "@/lib/format";

type RecipeIngredientRow = {
  ingredient_id: string;
  quantity_per_yield: number;
  unit: string | null;
  ingredients: { name: string; unit_of_measure: string | null; current_stock_qty: number; unit_cost: number } | null;
};

export function RecipePaxCalculator({
  recipeIngredients,
  yieldPax,
  defaultTargetPax,
}: {
  recipeIngredients: RecipeIngredientRow[];
  yieldPax: number;
  defaultTargetPax?: number;
}) {
  const [targetPax, setTargetPax] = useState(String(defaultTargetPax ?? yieldPax));

  const requirements: IngredientRequirement[] = useMemo(() => {
    const pax = Number(targetPax) || 0;
    if (pax <= 0) return [];
    return scaleIngredientRequirements(recipeIngredients, yieldPax, pax);
  }, [recipeIngredients, yieldPax, targetPax]);

  const totalCost = requirements.reduce((t, r) => t + r.quantityNeeded * r.unitCost, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-3">
        <div>
          <label className="text-[12.5px] font-semibold text-text-secondary">Pax to Calculate For</label>
          <input
            type="number"
            min="1"
            value={targetPax}
            onChange={(e) => setTargetPax(e.target.value)}
            className="mt-1.5 block h-10 w-40 rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
          />
        </div>
        <p className="pb-2.5 text-xs text-text-muted">Base recipe yields {yieldPax} pax — quantities below are scaled from that.</p>
      </div>

      {requirements.length === 0 ? (
        <p className="text-[13px] text-text-muted">No ingredients added to this recipe yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full border-collapse text-left">
            <thead className="bg-surface-alt">
              <tr className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
                <th className="px-3 py-2">Ingredient</th>
                <th className="px-3 py-2">Needed</th>
                <th className="px-3 py-2">In Stock</th>
                <th className="px-3 py-2">Est. Cost</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {requirements.map((r) => (
                <tr key={r.ingredientId} className="border-t border-border text-[13px]">
                  <td className="px-3 py-2 font-semibold text-text">{r.ingredientName}</td>
                  <td className="px-3 py-2 text-text-secondary">{r.quantityNeeded} {r.unit ?? ""}</td>
                  <td className="px-3 py-2 text-text-secondary">{r.currentStock} {r.unit ?? ""}</td>
                  <td className="px-3 py-2 text-text-secondary">{formatPrice(r.quantityNeeded * r.unitCost)}</td>
                  <td className="px-3 py-2">
                    {!r.sufficient && (
                      <a href={`/kitchen/purchase-requests/new?ingredient=${r.ingredientId}&qty=${Math.max(0, r.quantityNeeded - r.currentStock).toFixed(2)}`} className="text-xs font-bold text-danger">
                        Insufficient — Request Purchase
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end border-t border-border bg-surface-alt px-3 py-2 text-[13px] font-bold text-text">
            Estimated Ingredient Cost: {formatPrice(totalCost)}
          </div>
        </div>
      )}
    </div>
  );
}
