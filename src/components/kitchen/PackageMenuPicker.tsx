"use client";

import { useMemo, useState } from "react";
import { calculate, normName } from "@/lib/kitchenAi/calc";
import { display, formatQty } from "@/lib/kitchenAi/units";
import type { KItem, KSession, KState, RecipeData } from "@/lib/kitchenAi/types";
import type { Candidate, RecipeRef } from "@/lib/kitchenAi/match";
import { loadRecipes } from "@/lib/purchasePlanner/actions";
import { SIDE_LABEL, type KitchenSide } from "@/lib/kitchen/side";
import { Select } from "@/components/ui/Select";
import { useI18n } from "@/components/i18n/I18nProvider";

export type PackageDish = {
  id: string;
  mealLabel: string;
  section: string | null;
  name: string;
  side: KitchenSide;
  recipeId: string | null;
  candidates: Candidate[];
};

const selectClass = "h-9 w-full rounded-lg border border-border-strong bg-white px-2 text-[13px] outline-none focus:border-primary";
const chip = (active: boolean) => `rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${active ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text hover:bg-surface-alt"}`;

/**
 * Every item of a package menu, one by one (the choices written as "A / B / C" are separated), with a Kitchen / Bar filter. Tick the
 * items to see the ingredients they use and the quantity for the pax entered: (recipe quantity ÷ recipe yield) × pax, from the
 * recipes only. An item without a recipe is shown as "Recipe Data Required"; nothing is guessed.
 */
export function PackageMenuPicker({ dishes, recipeData, recipeRefs, minimumPax, companyId }: { dishes: PackageDish[]; recipeData: RecipeData[]; recipeRefs: RecipeRef[]; minimumPax: number; companyId: string }) {
  const [side, setSide] = useState<"all" | KitchenSide>("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [pax, setPax] = useState(String(minimumPax > 0 ? minimumPax : 1));
  const [recipeFor, setRecipeFor] = useState<Record<string, string | null>>(() => Object.fromEntries(dishes.map((d) => [d.id, d.recipeId])));
  const [recipes, setRecipes] = useState<Map<string, RecipeData>>(() => new Map(recipeData.map((r) => [r.id, r])));
  const [error, setError] = useState<string | null>(null);

  const { t } = useI18n();
  const [query, setQuery] = useState("");
  /** sections the person opened or closed by hand (key = meal | section); the rest follow the default */
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [allOpen, setAllOpen] = useState<boolean | null>(null);

  const counts = { all: dishes.length, kitchen: dishes.filter((d) => d.side === "kitchen").length, bar: dishes.filter((d) => d.side === "bar").length };
  const words = query.trim().toLowerCase();
  const shown = dishes.filter((d) => (side === "all" || d.side === side) && (!words || `${d.name} ${d.section ?? ""}`.toLowerCase().includes(words)));
  const sectionCount = new Set(shown.map((d) => `${d.mealLabel}|${d.section ?? ""}`)).size;
  const isOpen = (key: string) => toggled[key] ?? (allOpen !== null ? allOpen : words !== "" || sectionCount <= 3);
  const byMeal = useMemo(() => {
    const m = new Map<string, Map<string, PackageDish[]>>();
    for (const d of shown) {
      const sections = m.get(d.mealLabel) ?? new Map<string, PackageDish[]>();
      const key = d.section ?? "";
      sections.set(key, [...(sections.get(key) ?? []), d]);
      m.set(d.mealLabel, sections);
    }
    return Array.from(m.entries());
  }, [shown]);

  const chosen = dishes.filter((d) => selected.includes(d.id));
  const paxNumber = Number(pax) > 0 ? Number(pax) : null;

  const calc = useMemo(() => {
    if (chosen.length === 0) return null;
    const session: KSession = {
      id: "package",
      name: "Package menu",
      pax: paxNumber,
      paxSource: "user",
      items: chosen.map((d): KItem => ({ id: d.id, name: d.name, recipeId: recipeFor[d.id] ?? null, recipeBy: "user", candidates: d.candidates, estimate: null, origin: "typed", note: null })),
    };
    const state: KState = { version: 1, companyId, companyName: "", event: null, photoEventName: null, sessions: [session], documentIds: [], unitMode: "auto", mismatches: [], readerIssues: [], view: "ingredients", viewDish: null, stockCompared: false };
    return calculate(state, recipes, null);
  }, [chosen, paxNumber, recipeFor, recipes, companyId]);

  async function chooseRecipe(dishId: string, recipeId: string) {
    const id = recipeId || null;
    setRecipeFor((r) => ({ ...r, [dishId]: id }));
    if (id && !recipes.has(id)) {
      try {
        const r = await loadRecipes([id]);
        if (r.ok) setRecipes((m) => new Map([...m, ...r.recipes.map((x) => [x.id, x] as const)]));
        else setError(r.error);
      } catch {
        setError("Could not read the recipe. Please try again.");
      }
    }
  }

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Search an item or a section")}
          className="h-9 min-w-[220px] flex-1 rounded-lg border border-border-strong bg-white px-3 text-[13px] outline-none focus:border-primary"
        />
        {counts.bar > 0 && (
          <div className="flex items-center gap-1.5">
            {(["all", "kitchen", "bar"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setSide(k)} className={chip(side === k)}>
                {`${k === "all" ? "All" : SIDE_LABEL[k]} (${counts[k]})`}
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={() => { setToggled({}); setAllOpen(sectionCount > 0 && !Array.from(new Set(shown.map((d) => `${d.mealLabel}|${d.section ?? ""}`))).every((k) => isOpen(k))); }} className="rounded-lg border border-border-strong bg-white px-3 py-1.5 text-[12.5px] font-semibold text-text hover:border-primary">
          {Array.from(new Set(shown.map((d) => `${d.mealLabel}|${d.section ?? ""}`))).every((k) => isOpen(k)) ? "Collapse all" : "Expand all"}
        </button>
      </div>

      {chosen.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-primary/30 bg-info-bg px-3 py-2">
          <span className="mr-1 text-[12.5px] font-extrabold text-text">{`Chosen: ${chosen.length}`}</span>
          {chosen.map((d) => (
            <button key={d.id} type="button" onClick={() => toggle(d.id)} title="Remove" className="inline-flex items-center gap-1 rounded-full border border-primary bg-white px-2.5 py-0.5 text-[12px] font-semibold text-text hover:bg-surface-alt">
              {d.name}
              <span aria-hidden="true" className="text-text-muted">×</span>
            </button>
          ))}
          <button type="button" onClick={() => setSelected([])} className="ml-1 text-[12px] font-semibold text-text-secondary hover:underline">
            Clear all
          </button>
        </div>
      )}

      {byMeal.length === 0 && <p className="text-[13px] text-text-muted">{words ? "No item matches your search." : "No item on this side."}</p>}
      <div className="flex flex-col gap-4">
        {byMeal.map(([meal, sections]) => (
          <div key={meal}>
            {(byMeal.length > 1 || meal !== "Other") && <div className="mb-1.5 text-[12.5px] font-bold uppercase tracking-wide text-text-muted">{meal}</div>}
            <div className="flex flex-col gap-2">
              {Array.from(sections.entries()).map(([section, items]) => {
                const key = `${meal}|${section}`;
                const open = isOpen(key);
                const picked = items.filter((d) => selected.includes(d.id)).length;
                const allPicked = picked === items.length;
                return (
                  <div key={key} className="overflow-hidden rounded-xl border border-border bg-surface">
                    <div className="flex items-center gap-2 bg-surface-alt px-3 py-2">
                      <button type="button" aria-expanded={open} onClick={() => setToggled((s) => ({ ...s, [key]: !open }))} className="flex flex-1 items-center gap-2 text-left">
                        <span aria-hidden="true" className={`inline-block text-[11px] text-text-muted transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
                        <span className="text-[13px] font-extrabold uppercase tracking-wide text-text">{section || "Items"}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${picked > 0 ? "bg-primary text-white" : "bg-white text-text-muted"}`}>{picked > 0 ? `${picked} / ${items.length}` : items.length}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelected((s) => (allPicked ? s.filter((id) => !items.some((d) => d.id === id)) : Array.from(new Set([...s, ...items.map((d) => d.id)]))))}
                        className="text-[12px] font-semibold text-primary hover:underline"
                      >
                        {allPicked ? "Clear" : "Select all"}
                      </button>
                    </div>
                    {open && (
                      <div className="grid gap-1.5 p-2.5 sm:grid-cols-2 lg:grid-cols-3">
                        {items.map((d) => (
                          <label key={d.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[13px] ${selected.includes(d.id) ? "border-primary bg-info-bg" : "border-border bg-white hover:bg-surface-alt"}`}>
                            <input type="checkbox" checked={selected.includes(d.id)} onChange={() => toggle(d.id)} />
                            <span className="font-semibold text-text">{d.name}</span>
                            {d.side === "bar" && side === "all" && <span className="ml-auto text-[10.5px] font-bold uppercase text-text-muted">{SIDE_LABEL[d.side]}</span>}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {error && <div role="alert" className="text-[12.5px] text-danger">{error}</div>}

      {chosen.length > 0 && calc && (
        <div className="rounded-xl border border-border bg-surface-alt p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[14px] font-extrabold text-text">{`Ingredients of the chosen items: ${chosen.length}`}</div>
            <label className="flex items-center gap-2 text-[12.5px] font-semibold text-text-secondary">
              Pax
              <input type="number" min={1} value={pax} onChange={(e) => setPax(e.target.value)} className="h-8 w-24 rounded-md border border-border-strong bg-white px-2 text-[13px]" />
            </label>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            {chosen.map((d) => {
              const cur = recipeFor[d.id];
              const dish = calc.sessions[0].dishes.find((x) => x.itemId === d.id);
              return (
                <div key={d.id} className="rounded-lg border border-border bg-white p-3">
                  <div className="grid items-center gap-2 sm:grid-cols-[1fr_1.2fr]">
                    <div>
                      <div className="text-[13px] font-semibold text-text">{d.name}</div>
                      <div className="text-[11.5px] text-text-muted">
                        {cur && recipes.get(cur) ? `Recipe: ${recipes.get(cur)!.name} · for ${recipes.get(cur)!.yieldPax} pax · ${recipes.get(cur)!.lines.length} ingredients` : cur ? "Reading the recipe..." : "Recipe Data Required: choose a recipe"}
                      </div>
                    </div>
                    <Select value={cur ?? ""} onChange={(e) => void chooseRecipe(d.id, e.target.value)} className={`${selectClass} ${cur ? "" : "border-warning"}`}>
                      <option value="">No recipe chosen</option>
                      {d.candidates.length > 0 && (
                        <optgroup label="Suggested">
                          {d.candidates.map((c) => <option key={c.recipeId} value={c.recipeId}>{`${c.name} (${Math.round(c.score * 100)}%)`}</option>)}
                        </optgroup>
                      )}
                      <optgroup label="All recipes">
                        {recipeRefs.map((r) => <option key={r.id} value={r.id}>{`${r.name}${r.hasIngredients ? "" : " (no ingredients yet)"}`}</option>)}
                      </optgroup>
                    </Select>
                  </div>
                  {dish && dish.lines.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-text-secondary">
                      {dish.lines.map((l, i) => {
                        const q = display({ qty: l.qty, family: l.family, key: l.key });
                        return <span key={i}>{`${l.name}: ${formatQty(q.qty)} ${q.unit}`}</span>;
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 text-[13px] font-extrabold text-text">{paxNumber ? `All ingredients together for ${paxNumber} pax` : "All ingredients together"}</div>
          {calc.combined.length === 0 ? (
            <p className="mt-1 text-[12.5px] text-text-muted">{paxNumber ? "No ingredients yet: choose a recipe for the items above." : "Enter the pax to see the quantities."}</p>
          ) : (
            <table className="mt-1.5 w-full max-w-xl text-left text-[13px]">
              <thead>
                <tr className="border-b border-border text-[10.5px] font-bold uppercase tracking-wide text-text-muted">
                  <th className="py-1.5 pr-3">Ingredient</th>
                  <th className="py-1.5 text-right">Quantity</th>
                  <th className="py-1.5 pl-2">Unit</th>
                </tr>
              </thead>
              <tbody>
                {calc.combined.map((row) => {
                  const q = display({ qty: row.qty, family: row.family, key: row.key });
                  return (
                    <tr key={`${normName(row.name)}|${row.family}|${row.key}`} className="border-b border-border last:border-b-0">
                      <td className="py-1.5 pr-3 font-semibold text-text">{row.name}</td>
                      <td className="py-1.5 text-right text-text">{formatQty(q.qty)}</td>
                      <td className="py-1.5 pl-2 text-text-secondary">{q.unit}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {calc.needsData.some((n) => n.reason === "recipe" || n.reason === "recipe_empty") && (
            <p className="mt-2 text-[12px] text-warning">Items without a recipe are not in the list: choose a recipe for them above.</p>
          )}
        </div>
      )}
    </div>
  );
}
