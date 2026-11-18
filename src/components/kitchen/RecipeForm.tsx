"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createIngredient, createRecipe, renameIngredient, updateRecipe, type RecipeInput } from "@/lib/kitchen/actions";
import { normalizeUnit, unitChoices } from "@/lib/kitchen/constants";
import { Select } from "@/components/ui/Select";

type Company = { id: string; name: string };
type MenuItem = { id: string; name: string; company_id: string };
type Ingredient = { id: string; name: string; unit_of_measure: string | null; company_id: string };
type Line = { id?: string; ingredientId: string; quantityPerYield: string; unit: string };

/** The saved recipe being edited (its company cannot be changed). */
export type RecipeInitial = { id: string; companyId: string; menuItemId: string; name: string; yieldPax: number; instructions: string; lines: { id: string; ingredientId: string; quantityPerYield: number; unit: string }[] };

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

const NEW_ITEM = "__new__";

function emptyLine(): Line {
  return { ingredientId: "", quantityPerYield: "", unit: "" };
}

export function RecipeForm({
  companies,
  defaultCompanyId,
  menuItems,
  ingredients,
  initial,
}: {
  initial?: RecipeInitial;
  companies: Company[];
  defaultCompanyId?: string;
  menuItems: MenuItem[];
  ingredients: Ingredient[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(initial?.companyId ?? defaultCompanyId ?? companies[0]?.id ?? "");
  const [menuItemId, setMenuItemId] = useState(initial?.menuItemId ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [yieldPax, setYieldPax] = useState(initial ? String(initial.yieldPax) : "10");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [lines, setLines] = useState<Line[]>(
    initial && initial.lines.length > 0
      ? initial.lines.map((l) => ({ id: l.id, ingredientId: l.ingredientId, quantityPerYield: String(l.quantityPerYield), unit: l.unit }))
      : [emptyLine()],
  );
  const [ingredientList, setIngredientList] = useState<Ingredient[]>(ingredients);
  // Inline editor under an ingredient row: add a brand-new item, or rename the selected one.
  const [editor, setEditor] = useState<{ index: number; mode: "new" | "rename"; name: string; unit: string } | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  const menuItemsForCompany = menuItems.filter((m) => m.company_id === companyId);
  const ingredientsForCompany = ingredientList.filter((i) => i.company_id === companyId);

  function updateLine(index: number, field: keyof Line, value: string) {
    setLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === "ingredientId") {
        const ing = ingredientList.find((i) => i.id === value);
        if (ing) next[index].unit = normalizeUnit(ing.unit_of_measure);
      }
      return next;
    });
  }

  function handleIngredientSelect(index: number, value: string) {
    setEditorError(null);
    if (value === NEW_ITEM) {
      setEditor({ index, mode: "new", name: "", unit: normalizeUnit(lines[index].unit) || "KG" });
      return;
    }
    setEditor(null);
    updateLine(index, "ingredientId", value);
  }

  function startRename(index: number) {
    const ing = ingredientList.find((i) => i.id === lines[index].ingredientId);
    if (!ing) return;
    setEditorError(null);
    setEditor({ index, mode: "rename", name: ing.name, unit: "" });
  }

  async function saveEditor() {
    if (!editor) return;
    const name = editor.name.trim();
    if (!name) {
      setEditorError("Enter the item name.");
      return;
    }
    setEditorBusy(true);
    setEditorError(null);
    try {
      if (editor.mode === "new") {
        const created = await createIngredient({ companyId, name, unitOfMeasure: editor.unit || undefined, currentStockQty: 0, reorderLevel: 0, unitCost: 0 });
        setIngredientList((prev) => [...prev, { id: created.id, name, unit_of_measure: editor.unit || null, company_id: companyId }]);
        setLines((prev) => prev.map((l, i) => (i === editor.index ? { ...l, ingredientId: created.id, unit: editor.unit } : l)));
      } else {
        const id = lines[editor.index].ingredientId;
        await renameIngredient(id, name);
        setIngredientList((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));
      }
      setEditor(null);
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : "Could not save the item.");
    } finally {
      setEditorBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    if (initial) {
      try {
        await updateRecipe(initial.id, {
          name,
          menuItemId: menuItemId || undefined,
          yieldPax: Number(yieldPax) || 1,
          instructions: instructions || undefined,
          ingredients: lines
            .filter((l) => l.ingredientId && Number(l.quantityPerYield || 0) >= 0)
            .map((l) => ({ id: l.id, ingredientId: l.ingredientId, quantityPerYield: Number(l.quantityPerYield), unit: l.unit || undefined })),
        });
        router.push(`/kitchen/recipes/${initial.id}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setSaving(false);
      }
      return;
    }
    const payload: RecipeInput = {
      companyId,
      menuItemId: menuItemId || undefined,
      name,
      yieldPax: Number(yieldPax) || 1,
      instructions: instructions || undefined,
      ingredients: lines
        .filter((l) => l.ingredientId && Number(l.quantityPerYield || 0) >= 0)
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
          <Select
            required
            disabled={!!initial}
            value={companyId}
            onChange={(e) => { setCompanyId(e.target.value); setMenuItemId(""); setLines([emptyLine()]); }}
            className={inputClass}
          >
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div>
          <label className={labelClass}>Recipe Name *</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Nasi Briyani (base recipe)" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Linked Menu Item</label>
          <Select value={menuItemId} onChange={(e) => setMenuItemId(e.target.value)} className={inputClass}>
            <option value="">Not linked</option>
            {menuItemsForCompany.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
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
            <div key={i} className="flex flex-col gap-1.5">
              <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto] items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Select value={line.ingredientId} onChange={(e) => handleIngredientSelect(i, e.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-border-strong px-2 text-[13px]">
                    <option value="">Select ingredient</option>
                    {ingredientsForCompany.map((ing) => <option key={ing.id} value={ing.id}>{ing.name}</option>)}
                    <option value={NEW_ITEM}>＋ Add new item…</option>
                  </Select>
                  <button
                    type="button"
                    onClick={() => startRename(i)}
                    disabled={!line.ingredientId}
                    title="Edit item name"
                    aria-label="Edit item name"
                    className="h-9 shrink-0 rounded-lg border border-border-strong px-2 text-[12px] font-semibold text-primary disabled:opacity-40"
                  >
                    Edit
                  </button>
                </div>
                <input type="number" min="0" step="0.001" value={line.quantityPerYield} onChange={(e) => updateLine(i, "quantityPerYield", e.target.value)} placeholder="Quantity" className="h-9 w-full min-w-0 rounded-lg border border-border-strong px-2 text-[13px]" />
                <Select value={normalizeUnit(line.unit)} onChange={(e) => updateLine(i, "unit", e.target.value)} className="h-9 w-full min-w-0 rounded-lg border border-border-strong px-2 text-[13px]">
                  <option value="">Unit</option>
                  {unitChoices(line.unit).map((u) => <option key={u} value={u}>{u}</option>)}
                </Select>
                <button
                  type="button"
                  onClick={() => { setEditor(null); setLines((prev) => prev.filter((_, idx) => idx !== i)); }}
                  disabled={lines.length === 1}
                  className="text-xs font-semibold text-danger disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
              {editor && editor.index === i && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2">
                  <span className="text-[12px] font-semibold text-text-secondary">{editor.mode === "new" ? "New item name" : "Item name"}</span>
                  <input
                    autoFocus
                    value={editor.name}
                    onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void saveEditor(); } }}
                    placeholder="e.g. Ayam Whole"
                    className="h-8 min-w-[10rem] flex-1 rounded-lg border border-border-strong px-2 text-[13px]"
                  />
                  {editor.mode === "new" && (
                    <Select value={editor.unit} onChange={(e) => setEditor({ ...editor, unit: e.target.value })} className="h-8 rounded-lg border border-border-strong px-2 text-[13px]">
                      {unitChoices(editor.unit).map((u) => <option key={u} value={u}>{u}</option>)}
                    </Select>
                  )}
                  <button type="button" onClick={() => void saveEditor()} disabled={editorBusy} className="h-8 rounded-lg bg-primary px-3 text-[12.5px] font-semibold text-white disabled:opacity-60">
                    {editorBusy ? "Saving…" : editor.mode === "new" ? "Add item" : "Save name"}
                  </button>
                  <button type="button" onClick={() => setEditor(null)} className="h-8 rounded-lg border border-border-strong px-3 text-[12.5px] font-semibold text-text">Cancel</button>
                  {editorError && <span className="w-full text-[12px] font-semibold text-danger">{editorError}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
        {ingredientsForCompany.length === 0 && (
          <p className="mt-2 text-xs text-text-muted">No ingredients yet for this company — choose &quot;＋ Add new item…&quot; in the list to add one here.</p>
        )}
      </div>

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving || !name.trim()} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : initial ? "Save changes" : "Create Recipe"}
        </button>
      </div>
    </form>
  );
}
