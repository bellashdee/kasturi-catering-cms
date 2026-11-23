"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveIngredient, setIngredientActive, suggestPrices, type PriceSuggestion } from "@/lib/restaurant/menuActions";
import { UNITS, normUnit } from "@/lib/restaurant/costing";
import type { Ingredient } from "@/lib/restaurant/menuData";
import { formatCurrency, formatMalaysiaDate } from "@/lib/format";
import { Select } from "@/components/ui/Select";
import { StatusBadge } from "@/components/StatusBadge";
import { SPEND_GRID_3, SPEND_HINT, SPEND_INPUT, SPEND_LABEL, SPEND_SAVE_BTN } from "@/components/spending/formStyles";

type Form = { id?: string; name: string; unit: string; cost: string; yieldPct: string; seafood: boolean; notes: string; fromSuggestion: boolean };
const EMPTY: Form = { name: "", unit: "kg", cost: "", yieldPct: "100", seafood: false, notes: "", fromSuggestion: false };
const cost4 = (v: number) => (Math.round(v * 10000) / 10000).toString();

/** The costing list of the restaurant: each ingredient with the unit its price is for, the unit cost and the usable share after cleaning (yield). Deactivated, never deleted. */
export function IngredientsManager({ companyId, ingredients, canEdit, canSuggest }: { companyId: string; ingredients: Ingredient[]; canEdit: boolean; canSuggest: boolean }) {
  const router = useRouter();
  const [f, setF] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PriceSuggestion[] | null>(null);
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const r = await saveIngredient({ companyId, id: f.id, name: f.name, unit: f.unit, unitCost: f.cost.trim() === "" ? null : Number(f.cost), yieldPct: Number(f.yieldPct), isSeafood: f.seafood, notes: f.notes, fromSuggestion: f.fromSuggestion });
      if (!r.ok) setError(r.error);
      else {
        setF(EMPTY);
        setSuggestions(null);
        setMessage("Saved.");
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(i: Ingredient) {
    setBusy(true);
    setError(null);
    try {
      const r = await setIngredientActive(i.id, !i.is_active);
      if (!r.ok) setError(r.error);
      else router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function suggest() {
    setBusy(true);
    setError(null);
    try {
      const r = await suggestPrices(companyId, f.name);
      if (!r.ok) setError(r.error);
      else setSuggestions(r.suggestions);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}
      {message && <div role="status" className="rounded-lg border border-success/30 bg-success-bg px-3 py-2 text-[13px] text-success">{message}</div>}

      {canEdit && (
        <form onSubmit={save} className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
          <div className="mb-3 text-[15px] font-bold text-text">{f.id ? "Change the ingredient" : "Add an ingredient"}</div>
          <div className={SPEND_GRID_3}>
            <div className="sm:col-span-2">
              <label className={SPEND_LABEL}>Name *</label>
              <input value={f.name} onChange={(e) => set({ name: e.target.value })} className={SPEND_INPUT} required />
            </div>
            <div>
              <label className={SPEND_LABEL}>Unit of the price *</label>
              <Select value={f.unit} onChange={(e) => set({ unit: e.target.value })} className={SPEND_INPUT}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </Select>
            </div>
            <div>
              <label className={SPEND_LABEL}>Unit cost (RM per unit)</label>
              <input inputMode="decimal" type="number" min="0" step="0.0001" value={f.cost} onChange={(e) => set({ cost: e.target.value, fromSuggestion: false })} className={SPEND_INPUT} />
              <div className={SPEND_HINT}>Typed by you. A supplier price below is only a suggestion</div>
            </div>
            <div>
              <label className={SPEND_LABEL}>Usable after cleaning (yield %)</label>
              <input inputMode="decimal" type="number" min="1" max="100" step="0.1" value={f.yieldPct} onChange={(e) => set({ yieldPct: e.target.value })} className={SPEND_INPUT} />
              <div className={SPEND_HINT}>100 when nothing is lost; a whole fish is about 55 to 65</div>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 pb-2 text-[13px] font-semibold text-text-secondary">
                <input type="checkbox" checked={f.seafood} onChange={(e) => set({ seafood: e.target.checked })} className="h-4 w-4 accent-[var(--color-primary)]" />
                Seafood
              </label>
            </div>
            <div className="sm:col-span-3">
              <label className={SPEND_LABEL}>Note</label>
              <input value={f.notes} onChange={(e) => set({ notes: e.target.value })} className={SPEND_INPUT} />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="submit" disabled={busy} className={SPEND_SAVE_BTN}>{busy ? "Saving..." : f.id ? "Save the change" : "Add the ingredient"}</button>
            {canSuggest && <button type="button" disabled={busy || f.name.trim().length < 3} onClick={suggest} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text disabled:opacity-60">Suggest a price from the suppliers</button>}
            {f.id && <button type="button" onClick={() => { setF(EMPTY); setSuggestions(null); }} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">Cancel the change</button>}
          </div>
          {suggestions && (
            <div className="mt-3 rounded-xl border border-border px-4 py-3 text-[13px]">
              <div className="mb-1 font-bold text-text">Suggestions: what the suppliers of O2 Life charged (a suggestion only: check it before using it)</div>
              {suggestions.length === 0 ? (
                <div className="text-text-muted">No supplier invoice, quote or purchase with a similar name was found.</div>
              ) : (
                <table className="w-full">
                  <tbody>
                    {suggestions.map((s, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="py-1.5">{s.name}</td>
                        <td className="py-1.5 text-text-secondary">{s.supplier ?? "—"}</td>
                        <td className="py-1.5 text-text-secondary">{s.source}{s.date ? `, ${formatMalaysiaDate(`${s.date}T12:00:00+08:00`)}` : ""}</td>
                        <td className="py-1.5 text-right font-semibold">{`${formatCurrency(s.price)} / ${s.unit ?? "?"}`}</td>
                        <td className="py-1.5 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              const u = normUnit(s.unit);
                              set({ cost: cost4(s.price), unit: (UNITS as readonly string[]).includes(u) ? u : f.unit, fromSuggestion: true });
                            }}
                            className="text-[12.5px] font-semibold text-primary"
                          >
                            Use this price
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </form>
      )}

      <div className="rounded-3xl border border-border bg-surface shadow-sm">
        <div className="overflow-x-auto p-2 sm:p-4">
          {ingredients.length === 0 ? (
            <div className="py-6 text-center text-[13px] text-text-muted">No ingredient in the costing list yet.</div>
          ) : (
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-text-muted">
                  <th className="px-2 py-2 font-semibold">Ingredient</th>
                  <th className="px-2 py-2 font-semibold">Unit</th>
                  <th className="px-2 py-2 text-right font-semibold">Unit cost</th>
                  <th className="px-2 py-2 text-right font-semibold">Yield %</th>
                  <th className="px-2 py-2 text-right font-semibold">Cost per usable unit</th>
                  <th className="px-2 py-2 font-semibold">Status</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {ingredients.map((i) => (
                  <tr key={i.id} className={`border-b border-border last:border-0 ${i.is_active ? "" : "text-text-muted"}`}>
                    <td className="px-2 py-2 font-semibold">{i.name}{i.is_seafood && <span className="ml-1.5 text-[11.5px] font-normal text-text-secondary">seafood</span>}</td>
                    <td className="px-2 py-2">{i.unit}</td>
                    <td className="px-2 py-2 text-right">{i.unit_cost === null ? <span className="text-warning">not set</span> : formatCurrency(i.unit_cost)}</td>
                    <td className="px-2 py-2 text-right">{i.yield_pct}</td>
                    <td className="px-2 py-2 text-right">{i.unit_cost === null ? "—" : formatCurrency(Math.round((i.unit_cost / (i.yield_pct / 100)) * 10000) / 10000)}</td>
                    <td className="px-2 py-2">{i.is_active ? <StatusBadge tone="success">Active</StatusBadge> : <StatusBadge tone="neutral">Deactivated</StatusBadge>}{i.price_source === "suggestion" && <span className="ml-1.5 text-[11.5px] text-text-muted">price from a supplier</span>}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">
                      {canEdit && (
                        <>
                          <button type="button" onClick={() => { setF({ id: i.id, name: i.name, unit: i.unit, cost: i.unit_cost === null ? "" : cost4(i.unit_cost), yieldPct: String(i.yield_pct), seafood: i.is_seafood, notes: i.notes ?? "", fromSuggestion: i.price_source === "suggestion" }); setSuggestions(null); setMessage(null); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="mr-2 text-[12.5px] font-semibold text-primary">Change</button>
                          <button type="button" disabled={busy} onClick={() => toggle(i)} className="text-[12.5px] font-semibold text-danger">{i.is_active ? "Deactivate" : "Activate"}</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
