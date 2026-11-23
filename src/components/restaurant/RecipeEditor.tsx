"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { approveRecipeVersion, saveRecipe } from "@/lib/restaurant/menuActions";
import { REASON_TEXT, UNITS, margin, recipeCost } from "@/lib/restaurant/costing";
import type { Ingredient, Version } from "@/lib/restaurant/menuData";
import { BARA_LIMITS } from "@/lib/monthlyBreakdown/restoranBara";
import { formatCurrency } from "@/lib/format";
import { Select } from "@/components/ui/Select";
import { StatusBadge } from "@/components/StatusBadge";
import { SPEND_HINT, SPEND_INPUT, SPEND_LABEL, SPEND_SAVE_BTN } from "@/components/spending/formStyles";

type Line = { ingredientId: string; quantity: string; unit: string; waste: string; note: string };
const EMPTY_LINE: Line = { ingredientId: "", quantity: "", unit: "g", waste: "0", note: "" };
const money = (v: number) => formatCurrency(Math.round(v * 100) / 100);

/**
 * The recipe of one menu item. Saving makes a draft (when the latest version is already approved, a NEW version: the approved ones are never changed).
 * The cost shown here uses the CURRENT costing list; the saved version keeps the costs it was saved with. A Manager or an Admin approves a draft
 * (not their own, unless an Admin), and the approved version becomes the current one.
 */
export function RecipeEditor({
  menuItemId,
  price,
  ingredients,
  latest,
  canEdit,
  canApprove,
}: {
  menuItemId: string;
  price: number | null;
  ingredients: Ingredient[];
  /** the latest version (a draft or an approved one): the lines to start from */
  latest: Version | null;
  canEdit: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>(
    latest && latest.lines.length > 0
      ? latest.lines.map((l) => ({ ingredientId: l.ingredient_id ?? "", quantity: String(l.quantity), unit: l.unit, waste: String(l.waste_pct), note: l.note ?? "" }))
      : [{ ...EMPTY_LINE }],
  );
  const [yieldText, setYieldText] = useState(latest ? String(latest.portion_yield) : "1");
  const [portionText, setPortionText] = useState(latest?.portion_text ?? "");
  const [instructions, setInstructions] = useState(latest?.instructions ?? "");
  const [changeNote, setChangeNote] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const byId = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const touch = () => {
    setDirty(true);
    setMessage(null);
  };
  const setLine = (i: number, patch: Partial<Line>) => {
    setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
    touch();
  };

  // the live cost, from the costing list as it is now
  const portionYield = Number(yieldText) > 0 ? Number(yieldText) : 1;
  const live = useMemo(() => {
    const costLines = lines
      .filter((l) => l.ingredientId && Number(l.quantity) > 0)
      .map((l) => {
        const ing = byId.get(l.ingredientId);
        return { quantity: Number(l.quantity), unit: l.unit, waste_pct: Number(l.waste) || 0, unit_cost: ing?.unit_cost ?? null, cost_unit: ing?.unit ?? null, yield_pct: ing?.yield_pct ?? 100 };
      });
    return { cost: recipeCost(costLines, portionYield), count: costLines.length };
  }, [lines, byId, portionYield]);
  const m = margin(price, live.cost.perPortion);
  const limit = BARA_LIMITS.raw * 100;

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const r = await saveRecipe({
        menuItemId,
        portionYield: Number(yieldText),
        portionText,
        instructions,
        changeNote,
        lines: lines.filter((l) => l.ingredientId || l.quantity).map((l) => ({ ingredientId: l.ingredientId, quantity: Number(l.quantity), unit: l.unit, wastePct: Number(l.waste) || 0, note: l.note })),
      });
      if (!r.ok) setError(r.error);
      else {
        setDirty(false);
        setChangeNote("");
        setMessage(latest?.status === "approved" ? "Saved as a new draft version. It becomes the current recipe when it is approved." : "Saved as a draft.");
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!latest || latest.status !== "draft") return;
    if (!window.confirm(`Approve version ${latest.version_no}? It becomes the current recipe of this item and can no longer be changed (a change makes a new version).`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await approveRecipeVersion(latest.id);
      if (!r.ok) setError(r.error);
      else {
        setMessage(`Version ${latest.version_no} is approved.`);
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[15px] font-bold text-text">Recipe</div>
        {latest && (
          <div className="flex items-center gap-2 text-[12.5px] text-text-secondary">
            <span>{`Latest: version ${latest.version_no}`}</span>
            <StatusBadge tone={latest.status === "approved" ? "success" : "warning"}>{latest.status === "approved" ? "Approved" : "Draft"}</StatusBadge>
          </div>
        )}
      </div>
      {error && <div role="alert" className="mb-3 rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}
      {message && <div role="status" className="mb-3 rounded-lg border border-success/30 bg-success-bg px-3 py-2 text-[13px] text-success">{message}</div>}
      {ingredients.length === 0 && <div className="mb-3 rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-[13px] text-warning">The costing list has no ingredient yet. Add the ingredients first in the Ingredients tab.</div>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13.5px]">
          <thead>
            <tr className="border-b border-border text-left text-[12px] text-text-muted">
              <th className="px-1 py-2 font-semibold">Ingredient</th>
              <th className="px-1 py-2 font-semibold">Quantity</th>
              <th className="px-1 py-2 font-semibold">Unit</th>
              <th className="px-1 py-2 font-semibold">Waste %</th>
              <th className="px-1 py-2 font-semibold">Note</th>
              <th className="px-1 py-2 text-right font-semibold">Cost</th>
              <th className="px-1 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const ing = byId.get(l.ingredientId);
              const idx = lines.filter((x, k) => k <= i && x.ingredientId && Number(x.quantity) > 0).length - 1;
              const lc = l.ingredientId && Number(l.quantity) > 0 ? live.cost.lines[idx] : null;
              return (
                <tr key={i} className="border-b border-border align-top last:border-0">
                  <td className="px-1 py-1.5">
                    <Select
                      value={l.ingredientId}
                      onChange={(e) => {
                        const picked = byId.get(e.target.value);
                        setLine(i, { ingredientId: e.target.value, unit: picked && !l.quantity ? picked.unit : l.unit });
                      }}
                      disabled={!canEdit}
                      className="h-9 w-full rounded-lg border border-border-strong bg-white px-2 text-[13px]"
                    >
                      <option value="">— choose —</option>
                      {ingredients.filter((x) => x.is_active || x.id === l.ingredientId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </Select>
                    {ing && <div className="mt-0.5 text-[11.5px] text-text-muted">{ing.unit_cost === null ? "No unit cost" : <>{`${money(ing.unit_cost)} / ${ing.unit}`}{ing.yield_pct < 100 && <> · {ing.yield_pct}% usable</>}</>}</div>}
                  </td>
                  <td className="px-1 py-1.5"><input inputMode="decimal" type="number" min="0" step="0.001" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} disabled={!canEdit} className="h-9 w-24 rounded-lg border border-border-strong bg-white px-2 text-[13px]" /></td>
                  <td className="px-1 py-1.5">
                    <Select value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} disabled={!canEdit} className="h-9 w-24 rounded-lg border border-border-strong bg-white px-2 text-[13px]">
                      {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </Select>
                  </td>
                  <td className="px-1 py-1.5"><input inputMode="decimal" type="number" min="0" max="89" step="0.1" value={l.waste} onChange={(e) => setLine(i, { waste: e.target.value })} disabled={!canEdit} className="h-9 w-20 rounded-lg border border-border-strong bg-white px-2 text-[13px]" /></td>
                  <td className="px-1 py-1.5"><input value={l.note} onChange={(e) => setLine(i, { note: e.target.value })} disabled={!canEdit} className="h-9 w-full min-w-[120px] rounded-lg border border-border-strong bg-white px-2 text-[13px]" /></td>
                  <td className="px-1 py-1.5 text-right">
                    {lc ? (lc.cost === null ? <span className="text-[12px] text-warning">{REASON_TEXT[lc.reason]}</span> : <span className="font-semibold">{money(lc.cost)}</span>) : "—"}
                  </td>
                  <td className="px-1 py-1.5 text-right">
                    {canEdit && lines.length > 1 && <button type="button" onClick={() => { setLines((ls) => ls.filter((_, k) => k !== i)); touch(); }} className="text-[12.5px] font-semibold text-danger">Remove</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canEdit && <button type="button" onClick={() => { setLines((ls) => [...ls, { ...EMPTY_LINE }]); touch(); }} className="mt-2 text-[13px] font-semibold text-primary">+ Add an ingredient</button>}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={SPEND_LABEL}>Portions this recipe makes</label>
          <input inputMode="decimal" type="number" min="0.001" step="0.001" value={yieldText} onChange={(e) => { setYieldText(e.target.value); touch(); }} disabled={!canEdit} className={SPEND_INPUT} />
          <div className={SPEND_HINT}>1 for a dish made to order; 20 for a batch of sambal for 20 portions</div>
        </div>
        <div>
          <label className={SPEND_LABEL}>Portion size</label>
          <input value={portionText} onChange={(e) => { setPortionText(e.target.value); touch(); }} disabled={!canEdit} className={SPEND_INPUT} />
        </div>
        <div>
          <label className={SPEND_LABEL}>What changed (for a new version)</label>
          <input value={changeNote} onChange={(e) => { setChangeNote(e.target.value); touch(); }} disabled={!canEdit} className={SPEND_INPUT} placeholder="e.g. more sambal, new supplier price" />
        </div>
        <div className="sm:col-span-3">
          <label className={SPEND_LABEL}>Method</label>
          <textarea value={instructions} onChange={(e) => { setInstructions(e.target.value); touch(); }} disabled={!canEdit} rows={3} className={`${SPEND_INPUT} h-auto py-2`} />
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-surface-alt px-4 py-3 text-[13.5px]">
        {live.cost.complete ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
            <div><div className="text-text-muted">Cost of the recipe</div><div className="font-bold">{money(live.cost.total as number)}</div></div>
            <div><div className="text-text-muted">Cost per portion</div><div className="font-bold">{money(live.cost.perPortion as number)}</div></div>
            <div><div className="text-text-muted">Food cost %</div><div className={`font-bold ${m.foodCostPct !== null && m.foodCostPct > limit ? "text-danger" : ""}`}>{m.foodCostPct === null ? "—" : `${m.foodCostPct.toFixed(1)}%`}</div></div>
            <div><div className="text-text-muted">Profit per serving</div><div className="font-bold">{m.profit === null ? "—" : money(m.profit)}</div></div>
          </div>
        ) : (
          <div className="font-semibold text-warning">Cost incomplete: {live.count === 0 ? "add the ingredients with their quantities" : "a line has no unit cost, or its unit cannot be turned into the unit of the cost"}. No total is shown until every line has a cost.</div>
        )}
        {price === null && <div className="mt-1 text-[12px] text-text-muted">The menu price is not set, so the food cost % and the profit are not shown.</div>}
        {m.foodCostPct !== null && m.foodCostPct > limit && <div className="mt-1 text-[12px] text-danger">{`Above the Bara limit for raw items (${limit.toFixed(0)}% of sales, from the Monthly Breakdown).`}</div>}
        <div className="mt-1 text-[12px] text-text-muted">This is worked out with the costing list as it is now. A saved version keeps the costs it was saved with.</div>
      </div>

      {canEdit && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={save} className={SPEND_SAVE_BTN}>{busy ? "Saving..." : latest?.status === "approved" ? "Save as a new version (draft)" : "Save the draft"}</button>
          {canApprove && latest?.status === "draft" && (
            <button type="button" disabled={busy || dirty} onClick={approve} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text disabled:opacity-60">
              {`Approve version ${latest.version_no}`}
            </button>
          )}
          {dirty && latest?.status === "draft" && canApprove && <span className="text-[12px] text-text-muted">Save the draft before approving.</span>}
        </div>
      )}
    </div>
  );
}
