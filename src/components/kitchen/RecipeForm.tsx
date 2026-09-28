"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRecipe, type RecipeInput } from "@/lib/kitchen/actions";

type Company = { id: string; name: string };
type MenuItem = { id: string; name: string; company_id: string };
type Ingredient = { id: string; name: string; unit_of_measure: string | null; company_id: string };
type Line = { ingredientId: string; quantityPerYield: string; unit: string };

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

function emptyLine(): Line {
  return { ingredientId: "", quantityPerYield: "", unit: "" };
}

export function RecipeForm({
  companies,
  defaultCompanyId,
  menuItems,
  ingredients,
}: {
  companies: Company[];
  defaultCompanyId?: string;
  menuItems: MenuItem[];
  ingredients: Ingredient[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [menuItemId, setMenuItemId] = useState("");
  const [name, setName] = useState("");
  const [yieldPax, setYieldPax] = useState("10");
  const [instructions, setInstructions] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);

  const menuItemsForCompany = menuItems.filter((m) => m.company_id === companyId);
  const ingredientsForCompany = ingredients.filter((i) => i.company_id === companyId);

  function updateLine(index: number, field: keyof Line, value: string) {
    setLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === "ingredientId") {
        const ing = ingredients.find((i) => i.id === value);
        if (ing) next[index].unit = ing.unit_of_measure ?? "";
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload: RecipeInput = {
      companyId,
      menuItemId: menuItemId || undefined,
      name,
      yieldPax: Number(yieldPax) || 1,
      instructions: instructions || undefined,
      ingredients: lines
        .filter((l) => l.ingredientId && Number(l.quantityPerYield) > 0)
        .map((l) => ({ ingredientId: l.ingredientId, quantityPerYield: Number(l.quantityPerYield), unit: l.unit || undefined })),
    };
    try {
      const created = await createRecipe(payload);
      router.push(`/kitchen/recipes/${created.id}`);
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
          <select
            required
            value={companyId}
            onChange={(e) => { setCompanyId(e.target.value); setMenuItemId(""); setLines([emptyLine()]); }}
            className={inputClass}
          >
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Recipe Name *</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Nasi Briyani (base recipe)" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Linked Menu Item</label>
          <select value={menuItemId} onChange={(e) => setMenuItemId(e.target.value)} className={inputClass}>
            <option value="">Not linked</option>
            {menuItemsForCompany.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Base Yield (Pax) *</label>
          <input type="number" min="1" required value={yieldPax} onChange={(e) => setYieldPax(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Instructions</label>
        <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} className="mt-1.5 h-20 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none" />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className={labelClass}>Ingredients (quantity needed for the base yield above)</label>
          <button type="button" onClick={() => setLines((prev) => [...prev, emptyLine()])} className="text-[12.5px] font-semibold text-primary">
            + Add Ingredient
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-[2fr_1fr_0.8fr_auto] items-center gap-2">
              <select value={line.ingredientId} onChange={(e) => updateLine(i, "ingredientId", e.target.value)} className="h-9 rounded-lg border border-border-strong px-2 text-[13px]">
                <option value="">Select ingredient</option>
                {ingredientsForCompany.map((ing) => <option key={ing.id} value={ing.id}>{ing.name}</option>)}
              </select>
              <input type="number" min="0" step="0.001" value={line.quantityPerYield} onChange={(e) => updateLine(i, "quantityPerYield", e.target.value)} placeholder="Quantity" className="h-9 rounded-lg border border-border-strong px-2 text-[13px]" />
              <input value={line.unit} onChange={(e) => updateLine(i, "unit", e.target.value)} placeholder="Unit" className="h-9 rounded-lg border border-border-strong px-2 text-[13px]" />
              <button
                type="button"
                onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                disabled={lines.length === 1}
                className="text-xs font-semibold text-danger disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        {ingredientsForCompany.length === 0 && (
          <p className="mt-2 text-xs text-text-muted">No ingredients yet for this company — add some in Ingredients first.</p>
        )}
      </div>

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving || !name.trim()} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Create Recipe"}
        </button>
      </div>
    </form>
  );
}
