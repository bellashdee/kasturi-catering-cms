"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/actionResult";
import { calculate, normName, type StockLookup } from "@/lib/kitchenAi/calc";
import { display, formatQty, type Base } from "@/lib/kitchenAi/units";
import type { KItem, KSession, KState, RecipeData } from "@/lib/kitchenAi/types";
import { loadEventPlan, loadRecipePlan, loadRecipes, createPlannedPurchaseOrders, type EventPlan } from "@/lib/purchasePlanner/actions";
import type { RecipeRef } from "@/lib/kitchenAi/match";
import { SIDE_LABEL, sideOf, type KitchenSide } from "@/lib/kitchen/side";
import { isBoughtReadyRecipe } from "@/lib/kitchen/recipeCategory";
import { bestSupplierItem, ingredientKey, quantityInUom, rankSupplierItems, type SupplierItemOption } from "@/lib/purchasePlanner/shared";
import { saveIngredientMatch } from "@/lib/purchasePlanner/matchActions";
import { SupplierItemPicker } from "@/components/procurement/SupplierItemPicker";
import type { PlannerEvent } from "@/lib/purchasePlanner/data";
import { formatPrice, formatCurrency } from "@/lib/format";
import { Select } from "@/components/ui/Select";
import { ChoiceSelect } from "@/components/ui/ChoiceSelect";

const inputClass = "h-9 w-full rounded-lg border border-border-strong bg-white px-2 text-[13px] outline-none focus:border-primary";
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

type RowState = { optionKey?: string; qty?: string; price?: string; skip?: boolean };

type Created = { id: string; poNumber: string; supplierName: string; total: number; items: number }[];

/** The chosen items together (so many can be chosen while searching), each one removable. */
function ChosenChips({ items, onRemove, onClear }: { items: { id: string; label: string }[]; onRemove: (id: string) => void; onClear: () => void }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {items.map((i) => (
        <span key={i.id} className="flex items-center gap-1 rounded-md bg-info-bg px-2 py-0.5 text-[12.5px] font-semibold text-text">
          {i.label}
          <button type="button" aria-label="Remove" onClick={() => onRemove(i.id)} className="text-text-muted hover:text-danger">
            ×
          </button>
        </span>
      ))}
      <button type="button" onClick={onClear} className="text-[12px] font-semibold text-text-secondary hover:underline">
        Clear all
      </button>
    </div>
  );
}

export function PurchasePlanner({ companyId, companyName, events, recipeOptions, supplierItems, savedMatches, query, initialMode = "event", setMenus = [] }: { companyId: string; companyName: string; events: PlannerEvent[]; recipeOptions: RecipeRef[]; supplierItems: SupplierItemOption[]; savedMatches: Record<string, string>; query: string; initialMode?: "event" | "recipes"; setMenus?: { id: string; name: string; recipeIds: string[] }[] }) {
  const router = useRouter();
  const [eventSearch, setEventSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  // where the purchase starts: the menu of an event, or recipes chosen by hand
  const [mode, setMode] = useState<"event" | "recipes">(initialMode);
  const [recipeSearch, setRecipeSearch] = useState("");
  // the supplier item each ingredient was bought as before (saved by a person); a new pick is saved too
  const [saved, setSaved] = useState<Map<string, string>>(() => new Map(Object.entries(savedMatches)));
  const [recipeSide, setRecipeSide] = useState<"all" | KitchenSide>("all");
  const [pickedRecipes, setPickedRecipes] = useState<string[]>([]);
  const [plan, setPlan] = useState<EventPlan | null>(null);
  const [recipes, setRecipes] = useState<Map<string, RecipeData>>(new Map());
  const [pax, setPax] = useState<Record<string, string>>({});
  const [dishRecipe, setDishRecipe] = useState<Record<string, string | null>>({});
  const [deduct, setDeduct] = useState(false);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  // the events of one month (this month first), sorted by date or by customer
  const [eventMonth, setEventMonth] = useState(() => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 7));
  const [eventSort, setEventSort] = useState<"date" | "customer">("date");
  const shownEvents = useMemo(() => {
    const words = norm(eventSearch).split(" ").filter(Boolean);
    const list = events.filter((e) => (!eventMonth || e.date.startsWith(eventMonth)) && words.every((w) => norm(`${e.name} ${e.customer ?? ""} ${e.date}`).includes(w)));
    return [...list].sort((a, b) => (eventSort === "customer" ? (a.customer ?? a.name).localeCompare(b.customer ?? b.name) || a.date.localeCompare(b.date) : a.date.localeCompare(b.date) || a.name.localeCompare(b.name)));
  }, [events, eventSearch, eventMonth, eventSort]);

  const shownRecipes = useMemo(() => {
    const words = norm(recipeSearch).split(" ").filter(Boolean);
    // desserts, kuih, bakery and fruit are bought ready: not offered here
    return recipeOptions.filter((r) => r.hasIngredients && !isBoughtReadyRecipe(r.name) && (recipeSide === "all" || sideOf(r.name) === recipeSide) && words.every((w) => norm(r.name).includes(w)));
  }, [recipeOptions, recipeSearch, recipeSide]);

  function startPlan(r: EventPlan) {
    setPlan(r);
    setRecipes(new Map(r.recipes.map((x) => [x.id, x])));
    setPax(Object.fromEntries(r.sessions.map((s) => [s.id, s.pax !== null ? String(s.pax) : ""])));
    setDishRecipe(Object.fromEntries(r.sessions.flatMap((s) => s.dishes.map((d) => [d.id, d.recipeId] as const))));
    setRowState({});
  }

  async function readRecipes() {
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const r = await loadRecipePlan(companyId, pickedRecipes);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      startPlan(r);
    } catch (err) {
      setError(errorMessage(err, "Could not read the recipes. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function readMenus() {
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const r = await loadEventPlan(companyId, picked);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      startPlan(r);
    } catch (err) {
      setError(errorMessage(err, "Could not read the menu. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function chooseRecipe(dishId: string, recipeId: string) {
    const id = recipeId || null;
    setDishRecipe((d) => ({ ...d, [dishId]: id }));
    if (id && !recipes.has(id)) {
      try {
        const r = await loadRecipes([id]);
        if (r.ok) setRecipes((m) => new Map([...m, ...r.recipes.map((x) => [x.id, x] as const)]));
      } catch {
        setError("Could not read the recipe. Please try again.");
      }
    }
  }

  const stockLookup = useMemo<StockLookup | null>(() => {
    if (!plan) return null;
    const byId: StockLookup["byId"] = new Map();
    const byName: StockLookup["byName"] = new Map();
    for (const s of plan.stock) {
      const info = { name: s.name, qty: s.qty, unit: s.unit };
      byId.set(s.id, info);
      byName.set(normName(s.name), info);
    }
    return { byId, byName };
  }, [plan]);

  const calc = useMemo(() => {
    if (!plan) return null;
    const sessions: KSession[] = plan.sessions.map((s) => ({
      id: s.id,
      name: s.eventName ? `${s.eventName} · ${s.name}` : s.name,
      pax: Number(pax[s.id]) > 0 ? Number(pax[s.id]) : null,
      paxSource: "event",
      items: s.dishes.map(
        (d): KItem => ({ id: d.id, name: d.name, recipeId: dishRecipe[d.id] ?? null, recipeBy: dishRecipe[d.id] === d.recipeId && d.auto ? "auto" : "user", candidates: d.candidates, estimate: null, origin: "event", note: null }),
      ),
    }));
    const state: KState = { version: 1, companyId, companyName, event: null, photoEventName: null, sessions, documentIds: [], unitMode: "auto", mismatches: [], readerIssues: [], view: "ingredients", viewDish: null, stockCompared: false };
    return calculate(state, recipes, deduct ? stockLookup : null);
  }, [plan, pax, dishRecipe, recipes, deduct, stockLookup, companyId, companyName]);

  const lines = useMemo(() => {
    if (!calc) return [];
    return calc.combined.map((row) => {
      const key = `${normName(row.name)}|${row.family}|${row.key}`;
      const base: Base = { qty: row.qty, family: row.family, key: row.key };
      const known = deduct && row.stock?.known;
      const needQty = known ? row.shortage ?? 0 : row.qty;
      const need: Base = { ...base, qty: needQty };
      const ranked = rankSupplierItems(row.name, supplierItems, 8, saved);
      return { key, row, need, enough: known && needQty <= 1e-9, ranked, auto: bestSupplierItem(row.name, supplierItems, saved) };
    });
  }, [calc, supplierItems, deduct, saved]);

  const resolved = lines.map((l) => {
    const st = rowState[l.key] ?? {};
    const option = st.optionKey !== undefined ? (supplierItems.find((o) => o.key === st.optionKey) ?? null) : l.auto;
    const auto = option ? quantityInUom(l.need, option.uom) : { qty: null as number | null };
    const qty = st.qty !== undefined ? Number(st.qty) : auto.qty;
    const price = st.price !== undefined ? Number(st.price) : (option?.price ?? null);
    const orderable = !!option && !st.skip && !l.enough && qty !== null && qty > 0 && price !== null && Number.isFinite(price);
    return { ...l, st, option, autoQty: auto.qty, unitMismatch: !!option && auto.qty === null, qty, price, orderable };
  });

  const bySupplier = useMemo(() => {
    const m = new Map<string, { supplierId: string; supplierName: string; items: { ingredient: string; itemName: string; quantity: number; unit: string; unitPrice: number }[] }>();
    for (const r of resolved) {
      if (!r.orderable || !r.option) continue;
      const cur = m.get(r.option.supplierId) ?? { supplierId: r.option.supplierId, supplierName: r.option.supplierName, items: [] };
      cur.items.push({ ingredient: r.row.name, itemName: r.option.description, quantity: r.qty as number, unit: r.option.uom, unitPrice: r.price as number });
      m.set(r.option.supplierId, cur);
    }
    return Array.from(m.values()).sort((a, b) => a.supplierName.localeCompare(b.supplierName));
  }, [resolved]);

  const notOrdered = resolved
    .filter((r) => !r.orderable)
    .map((r) => {
      const need = display(r.need);
      const reason = r.enough ? "Enough in stock" : r.st.skip ? "Skipped" : !r.option ? "No supplier item chosen yet" : r.qty === null || !(r.qty > 0) ? `Sold per ${r.option.uom || "unit"}: enter the quantity` : "Price missing";
      return { key: r.key, name: r.row.name, needed: `${formatQty(need.qty)} ${need.unit}`, reason };
    });

  const setRow = (key: string, patch: RowState) => setRowState((s) => ({ ...s, [key]: { ...s[key], ...patch } }));

  async function createOrders() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const names = plan.sessions.some((s) => s.eventId)
        ? Array.from(new Set(plan.sessions.map((s) => `${s.eventName} (${s.eventDate})`))).join("; ")
        : `Recipes: ${plan.sessions.map((s) => s.name).join(", ")}`;
      const r = await createPlannedPurchaseOrders({ companyId, sourceEvents: names, orders: bySupplier.map((s) => ({ supplierId: s.supplierId, items: s.items.map((i) => ({ itemName: i.itemName, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice })) })) });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setCreated(r.created);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not create the purchase orders. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  const grand = bySupplier.reduce((t, s) => t + s.items.reduce((u, i) => u + i.quantity * i.unitPrice, 0), 0);

  if (created) {
    return (
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
        <div className="text-[16px] font-extrabold text-text">{`Purchase orders created (draft): ${created.length}`}</div>
        <div className="flex flex-col gap-2">
          {created.map((c) => (
            <Link key={c.id} href={`/supplier-procurement/orders/${c.id}${query}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-4 py-2.5 text-[13.5px] hover:bg-surface-alt">
              <span className="font-semibold text-text">{`${c.poNumber} · ${c.supplierName}`}</span>
              <span className="text-text-secondary">{`Items: ${c.items} · ${formatCurrency(c.total)}`}</span>
            </Link>
          ))}
        </div>
        <div className="flex gap-2">
          <Link href={`/supplier-procurement/orders${query}`} className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white">
            Check the orders and send them to the suppliers
          </Link>
          <Link href={`/kitchen/purchase-requests${query}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-[13px] font-semibold text-text">
            Back to Purchase Requests
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 1. where the purchase starts */}
      <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap gap-1.5">
          {([["event", "By event menu"], ["recipes", "By recipes"]] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setMode(key)} className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${mode === key ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text hover:bg-surface-alt"}`}>
              {label}
            </button>
          ))}
        </div>

        {mode === "event" ? (
          <>
            <div className="mt-4 text-[14.5px] font-extrabold text-text">1. Choose the event(s)</div>
            <p className="mt-0.5 text-[12.5px] text-text-secondary">Search, then tick the events to buy for. Their menus and pax come from the event order.</p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="text-[12px] font-semibold text-text-secondary">
                Month
                <input type="month" value={eventMonth} onChange={(e) => setEventMonth(e.target.value)} className={`${inputClass} mt-1 block w-44`} />
              </label>
              <label className="text-[12px] font-semibold text-text-secondary">
                Sort by
                <select value={eventSort} onChange={(e) => setEventSort(e.target.value as "date" | "customer")} className={`${inputClass} mt-1 block w-44`}>
                  <option value="date">Event date</option>
                  <option value="customer">Customer name</option>
                </select>
              </label>
              <label className="min-w-[14rem] flex-1 text-[12px] font-semibold text-text-secondary">
                Search
                <input value={eventSearch} onChange={(e) => setEventSearch(e.target.value)} placeholder="Event, customer or date" className={`${inputClass} mt-1 block max-w-md`} />
              </label>
            </div>
            <ChosenChips items={picked.map((id) => ({ id, label: events.find((e) => e.id === id)?.name ?? id }))} onRemove={(id) => setPicked((p) => p.filter((x) => x !== id))} onClear={() => setPicked([])} />
            <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-border">
              {shownEvents.length === 0 && <div className="px-4 py-3 text-[13px] text-text-muted">No event in this month. Choose another month.</div>}
              {shownEvents.map((e) => (
                <label key={e.id} className="flex cursor-pointer items-center gap-3 border-b border-border px-4 py-2 text-[13px] last:border-b-0 hover:bg-surface-alt">
                  <input type="checkbox" checked={picked.includes(e.id)} onChange={(ev) => setPicked((p) => (ev.target.checked ? [...p, e.id] : p.filter((x) => x !== e.id)))} />
                  <span className="font-semibold text-text">{e.name}</span>
                  <span className="text-text-muted">{`${e.date}${e.customer && e.customer !== e.name ? ` · ${e.customer}` : ""}${e.pax ? ` · ${e.pax} pax` : ""} · ${e.status}`}</span>
                </label>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" disabled={busy || picked.length === 0} onClick={readMenus} className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
                {busy && !plan ? "Reading..." : plan ? "Read the menus again" : "Read the menu of the selected events"}
              </button>
              <span className="text-[12.5px] text-text-muted">{`${picked.length} selected`}</span>
            </div>
          </>
        ) : (
          <>
            <div className="mt-4 text-[14.5px] font-extrabold text-text">1. Choose the recipes</div>
            <p className="mt-0.5 text-[12.5px] text-text-secondary">Search, then tick the recipes to cook. You enter the pax of each one next; the ingredient list is worked out from the recipes only.</p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {(["all", "kitchen", "bar"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setRecipeSide(k)} className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold ${recipeSide === k ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text hover:bg-surface-alt"}`}>
                  {k === "all" ? "All" : SIDE_LABEL[k]}
                </button>
              ))}
            </div>
            {setMenus.length > 0 && (
              <div className="mt-3 block text-[12px] font-semibold text-text-secondary">
                Fixed menu of the day (adds all its recipes)
                {/* type to search (e.g. "jdt 3 menu 5") and pick: all its recipes are added, and the box is empty again for the next one */}
                <div className="mt-1 max-w-md">
                  <ChoiceSelect
                    value=""
                    onChange={(id) => {
                      const menu = setMenus.find((m) => m.id === id);
                      if (menu) setPickedRecipes((p) => Array.from(new Set([...p, ...menu.recipeIds.filter((rid) => !isBoughtReadyRecipe(recipeOptions.find((r) => r.id === rid)?.name ?? ""))])));
                    }}
                    options={setMenus.map((m) => ({ value: m.id, label: `${m.name} (${m.recipeIds.length} recipes)` }))}
                    placeholder="Type to search, e.g. JDT 3 Menu 5"
                    ariaLabel="Fixed menu of the day"
                    className={`${inputClass} w-full`}
                  />
                </div>
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input value={recipeSearch} onChange={(e) => setRecipeSearch(e.target.value)} placeholder="Search recipe..." className={`${inputClass} max-w-md`} />
              <button type="button" disabled={shownRecipes.length === 0} onClick={() => setPickedRecipes((p) => Array.from(new Set([...p, ...shownRecipes.map((r) => r.id)])))} className="h-9 rounded-lg border border-border-strong bg-white px-3 text-[12.5px] font-semibold text-text hover:border-primary disabled:opacity-50">
                {`Select all shown (${shownRecipes.length})`}
              </button>
            </div>
            <ChosenChips items={pickedRecipes.map((id) => ({ id, label: recipeOptions.find((r) => r.id === id)?.name ?? id }))} onRemove={(id) => setPickedRecipes((p) => p.filter((x) => x !== id))} onClear={() => setPickedRecipes([])} />
            <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-border">
              {shownRecipes.length === 0 && <div className="px-4 py-3 text-[13px] text-text-muted">No recipe found.</div>}
              {shownRecipes.map((r) => (
                <label key={r.id} className="flex cursor-pointer items-center gap-3 border-b border-border px-4 py-2 text-[13px] last:border-b-0 hover:bg-surface-alt">
                  <input type="checkbox" checked={pickedRecipes.includes(r.id)} onChange={(ev) => setPickedRecipes((p) => (ev.target.checked ? [...p, r.id] : p.filter((x) => x !== r.id)))} />
                  <span className="font-semibold text-text">{r.name}</span>
                </label>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" disabled={busy || pickedRecipes.length === 0} onClick={readRecipes} className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
                {busy && !plan ? "Reading..." : "Generate the ingredient list"}
              </button>
              <span className="text-[12.5px] text-text-muted">{`${pickedRecipes.length} selected`}</span>
              {pickedRecipes.length > 1 && <span className="text-[12.5px] text-text-muted">The ingredients of all of them are added together.</span>}
            </div>
          </>
        )}
      </section>

      {error && <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}

      {plan && calc && (
        <>
          <section className="rounded-xl border border-border bg-surface px-5 py-3 shadow-sm">
            <div className="text-[13px] font-extrabold text-text">{plan.sessions.some((s) => s.eventId) ? "Chosen events and menus" : "Recipes chosen"}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {plan.sessions.map((s) => (
                <span key={s.id} className="rounded-md bg-info-bg px-2 py-0.5 text-[12.5px] font-semibold text-text">
                  {`${s.eventName ? `${s.eventName} · ${s.name}` : s.name}${Number(pax[s.id]) > 0 ? ` · ${pax[s.id]} pax` : ""}`}
                </span>
              ))}
            </div>
          </section>

          {/* 2. menu */}
          <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="text-[14.5px] font-extrabold text-text">2. Menu and pax</div>
            <p className="mt-0.5 text-[12.5px] text-text-secondary">Check the pax and the recipe of every dish. The ingredients are calculated only from the recipes: (recipe quantity ÷ recipe yield) × pax.</p>
            <div className="mt-3 flex flex-col gap-4">
              {plan.sessions.map((s) => (
                <div key={s.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-[13.5px] font-bold text-text">{s.eventName ? `${s.eventName} · ${s.name}` : s.name}</div>
                    <label className="flex items-center gap-2 text-[12.5px] font-semibold text-text-secondary">
                      Pax
                      <input type="number" min={1} value={pax[s.id] ?? ""} onChange={(e) => setPax((p) => ({ ...p, [s.id]: e.target.value }))} className="h-8 w-24 rounded-md border border-border-strong px-2 text-[13px]" />
                    </label>
                  </div>
                  {s.serviceTypes.length > 0 && (
                    <div className="mt-1.5 text-[12px] text-text-muted">{`Service type (not a menu item): ${s.serviceTypes.join(", ")}`}</div>
                  )}
                  {s.dishes.length === 0 && <div className="mt-2 text-[12.5px] text-warning">This event has no menu written yet.</div>}
                  {s.dishes.map((d) => {
                    const chosen = dishRecipe[d.id];
                    return (
                      <div key={d.id} className="mt-2 grid items-center gap-2 sm:grid-cols-[1fr_1.2fr]">
                        <div>
                          <div className="text-[13px] font-semibold text-text">{d.name}</div>
                          <div className="text-[11.5px] text-text-muted">
                            {chosen && recipes.get(chosen)
                              ? `Recipe: ${recipes.get(chosen)!.name} · for ${recipes.get(chosen)!.yieldPax} pax · ${recipes.get(chosen)!.lines.length} ingredients`
                              : chosen
                                ? "Reading the recipe..."
                                : "No recipe attached yet"}
                          </div>
                        </div>
                        <Select value={chosen ?? ""} onChange={(e) => void chooseRecipe(d.id, e.target.value)} className={`${inputClass} ${chosen ? "" : "border-warning"}`}>
                          <option value="">No recipe chosen</option>
                          {d.candidates.length > 0 && (
                            <optgroup label="Suggested">
                              {d.candidates.map((c) => <option key={c.recipeId} value={c.recipeId}>{`${c.name} (${Math.round(c.score * 100)}%)`}</option>)}
                            </optgroup>
                          )}
                          <optgroup label="All recipes">
                            {plan.recipeRefs.map((r) => <option key={r.id} value={r.id}>{`${r.name}${r.hasIngredients ? "" : " (no ingredients yet)"}`}</option>)}
                          </optgroup>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {calc.needsData.length > 0 && (
              <div className="mt-3 rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-[12.5px] text-text">
                <b>Not in the list below yet:</b>
                {calc.needsData.map((n, i) => (
                  <div key={`${n.itemId}-${i}`}>{`• ${n.itemName} (${n.sessionName}): ${n.reason === "pax" ? "enter the pax" : n.reason === "recipe_empty" ? "its recipe has no ingredients yet" : "Recipe Data Required: choose a recipe"}`}</div>
                ))}
              </div>
            )}
          </section>

          {/* 3. ingredients and suppliers */}
          <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[14.5px] font-extrabold text-text">3. Ingredients and suppliers</div>
                <p className="mt-0.5 text-[12.5px] text-text-secondary">For each ingredient, choose the supplier item (search first, then select). The price is the latest price of that supplier; the quantity is worked out in the unit of that supplier.</p>
              </div>
              <label className="flex items-center gap-2 text-[12.5px] font-semibold text-text-secondary">
                <input type="checkbox" checked={deduct} onChange={(e) => setDeduct(e.target.checked)} />
                Deduct what is already in stock
              </label>
            </div>

            {resolved.length === 0 ? (
              <div className="mt-3 text-[13px] text-text-muted">No ingredients yet: choose the pax and the recipes above.</div>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[60rem] text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-[11px] font-bold uppercase tracking-wide text-text-muted">
                      <th className="py-2 pr-3">Ingredient</th>
                      <th className="py-2 pr-3">Needed</th>
                      <th className="py-2 pr-3 w-[22rem]">Supplier item</th>
                      <th className="py-2 pr-3">Order qty</th>
                      <th className="py-2 pr-3">Unit price (RM)</th>
                      <th className="py-2 pr-3 text-right">Amount</th>
                      <th className="py-2">Skip</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resolved.map((r) => {
                      const need = display(r.need);
                      const total = display({ qty: r.row.qty, family: r.row.family, key: r.row.key });
                      return (
                        <tr key={r.key} className={`border-b border-border align-top last:border-b-0 ${r.st.skip || r.enough ? "opacity-60" : ""}`}>
                          <td className="py-2 pr-3 font-semibold text-text">
                            {r.row.name}
                            {r.row.estimateQty > 0 && <div className="text-[11px] font-normal text-warning">Includes an AI estimate</div>}
                          </td>
                          <td className="py-2 pr-3 text-text-secondary">
                            {r.enough ? <span className="text-success">Enough in stock</span> : `${formatQty(need.qty)} ${need.unit}`}
                            {deduct && r.row.stock?.known && !r.enough && <div className="text-[11px] text-text-muted">{`of ${formatQty(total.qty)} ${total.unit} (stock deducted)`}</div>}
                            {deduct && r.row.stock && !r.row.stock.known && <div className="text-[11px] text-text-muted">stock not recorded</div>}
                          </td>
                          <td className="py-2 pr-3">
                            <SupplierItemPicker
                              ingredient={r.row.name}
                              selected={r.option}
                              suggestions={r.ranked.map((x) => x.option)}
                              all={supplierItems}
                              onPick={(key) => {
                                setRowState((s) => ({ ...s, [r.key]: { ...s[r.key], optionKey: key, qty: undefined, price: undefined } }));
                                const picked = supplierItems.find((o) => o.key === key);
                                if (picked) {
                                  // remembered for the next purchase list (a failure here never stops the list)
                                  setSaved((m) => new Map(m).set(ingredientKey(r.row.name), key));
                                  void saveIngredientMatch(companyId, { ingredient: r.row.name, supplierId: picked.supplierId, description: picked.description, uom: picked.uom }).catch(() => undefined);
                                }
                              }}
                            />
                            {r.option && <div className="mt-0.5 text-[11px] text-text-muted">{`${r.option.uom || "unit"} · last bought ${r.option.date}`}</div>}
                            {!r.option && <div className="mt-0.5 text-[11px] text-warning">No supplier item matched: search for it.</div>}
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={r.st.qty !== undefined ? r.st.qty : r.autoQty ?? ""}
                              onChange={(e) => setRow(r.key, { qty: e.target.value })}
                              disabled={!r.option}
                              className="h-8 w-24 rounded-md border border-border-strong px-2 text-[13px] disabled:bg-surface-alt"
                            />
                            {r.unitMismatch && r.st.qty === undefined && <div className="mt-0.5 w-32 text-[11px] text-warning">{`Sold per ${r.option?.uom || "unit"}: enter the quantity`}</div>}
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={r.st.price !== undefined ? r.st.price : r.option?.price ?? ""}
                              onChange={(e) => setRow(r.key, { price: e.target.value })}
                              disabled={!r.option}
                              className="h-8 w-24 rounded-md border border-border-strong px-2 text-[13px] disabled:bg-surface-alt"
                            />
                          </td>
                          <td className="py-2 pr-3 text-right font-semibold text-text">{r.orderable ? formatPrice((r.qty as number) * (r.price as number)) : "—"}</td>
                          <td className="py-2">
                            <input type="checkbox" checked={!!r.st.skip} onChange={(e) => setRow(r.key, { skip: e.target.checked })} aria-label={`Do not order ${r.row.name}`} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 4. purchase orders */}
          <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="text-[14.5px] font-extrabold text-text">4. Purchase orders by supplier</div>
            <p className="mt-0.5 text-[12.5px] text-text-secondary">The same list as above, by supplier: from which supplier, which item to buy and how much.</p>
            {bySupplier.length === 0 ? (
              <div className="mt-2 text-[13px] text-text-muted">Nothing to order yet: choose a supplier item and a quantity for at least one ingredient.</div>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                {bySupplier.map((s) => (
                  <div key={s.supplierId} className="overflow-x-auto rounded-lg border border-border">
                    <div className="flex items-center justify-between border-b border-border bg-surface-alt px-4 py-2 text-[13px] font-bold text-text">
                      <span>{s.supplierName}</span>
                      <span>{formatPrice(s.items.reduce((t, i) => t + i.quantity * i.unitPrice, 0))}</span>
                    </div>
                    <table className="w-full min-w-[40rem] text-left text-[12.5px]">
                      <thead>
                        <tr className="border-b border-border text-[10.5px] font-bold uppercase tracking-wide text-text-muted">
                          <th className="px-4 py-1.5">Ingredient</th>
                          <th className="px-2 py-1.5">Item to buy</th>
                          <th className="px-2 py-1.5 text-right">Qty</th>
                          <th className="px-2 py-1.5">Unit</th>
                          <th className="px-2 py-1.5 text-right">Unit price</th>
                          <th className="px-4 py-1.5 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.items.map((i, idx) => (
                          <tr key={idx} className="border-b border-border last:border-b-0">
                            <td className="px-4 py-1.5 font-semibold text-text">{i.ingredient}</td>
                            <td className="px-2 py-1.5 text-text">{i.itemName}</td>
                            <td className="px-2 py-1.5 text-right text-text">{formatQty(i.quantity)}</td>
                            <td className="px-2 py-1.5 text-text-secondary">{i.unit || "unit"}</td>
                            <td className="px-2 py-1.5 text-right text-text-secondary">{formatPrice(i.unitPrice)}</td>
                            <td className="px-4 py-1.5 text-right font-semibold text-text">{formatPrice(i.quantity * i.unitPrice)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}

            {notOrdered.length > 0 && (
              <div className="mt-3 rounded-lg border border-warning/40 bg-warning-bg px-4 py-3">
                <div className="text-[13px] font-bold text-text">Not in a purchase order yet</div>
                <p className="mt-0.5 text-[12px] text-text-secondary">These ingredients have no supplier item and quantity yet. Choose them in the list above to add them to an order.</p>
                <table className="mt-2 w-full text-left text-[12.5px]">
                  <tbody>
                    {notOrdered.map((n) => (
                      <tr key={n.key} className="border-t border-warning/20">
                        <td className="py-1 pr-3 font-semibold text-text">{n.name}</td>
                        <td className="py-1 pr-3 text-text-secondary">{n.needed}</td>
                        <td className="py-1 text-text-secondary">{n.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {bySupplier.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <button type="button" disabled={busy} onClick={createOrders} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
                  {busy ? "Creating..." : `Create purchase orders (${bySupplier.length})`}
                </button>
                <span className="text-[13px] font-semibold text-text">{`Total ${formatPrice(grand)}`}</span>
                <span className="text-[12px] text-text-muted">The orders are saved as drafts; you can still edit or delete them.</span>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
