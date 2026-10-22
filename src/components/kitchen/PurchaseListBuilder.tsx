"use client";

import { RecipePicker } from "@/components/kitchen/RecipePicker";
import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createPurchaseList } from "@/lib/purchaseList/actions";
import { consolidate, formatQty, normaliseName, scaleQuantity, type SelectedMenu, type StockMap } from "@/lib/purchaseList/calc";
import { MEAL_SESSIONS, PURCHASE_ITEM_STATUSES, PURCHASE_ITEM_STATUS_LABEL, STOCK_STATUS_LABEL } from "@/lib/purchaseList/constants";
import { sessionLabel, sessionRank } from "@/lib/purchaseList/sessions";
import type { CatalogMenu } from "@/lib/purchaseList/queries";

type Company = { id: string; name: string };
type EventOption = { id: string; company_id: string; event_name: string; event_date: string; pax_count: number | null; customer_name: string | null };
type StockRow = [name: string, quantity: number, unit: string | null];
type Group = { id: string; label: string; category: string | null; weeks: number[]; sessions: string[]; menus: CatalogMenu[] };
type Override = { final?: string; remark?: string; status?: string };

const inputClass = "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

function chip(on: boolean) {
  return `cursor-pointer rounded-lg border px-3 py-1.5 text-[13px] font-semibold ${on ? "border-primary bg-info-bg text-primary" : "border-border-strong text-text-secondary hover:bg-surface-alt"}`;
}

/** A dish needs review when the menu data is incomplete: no ingredients, or a blank quantity / blank unit. */
function reviewReasons(menu: CatalogMenu): string[] {
  const reasons: string[] = [];
  if (menu.lines.length === 0) reasons.push("no ingredients recorded");
  const blanks = menu.lines.filter((l) => l.baseQuantity === null).length;
  if (blanks > 0) reasons.push(`${blanks} blank quantit${blanks === 1 ? "y" : "ies"}`);
  const noUnit = menu.lines.filter((l) => l.baseQuantity !== null && !(l.unit ?? "").trim()).length;
  if (noUnit > 0) reasons.push(`${noUnit} without a unit`);
  return reasons;
}

export function PurchaseListBuilder({
  companies,
  defaultCompanyId,
  catalog,
  stock,
  events,
}: {
  companies: Company[];
  defaultCompanyId?: string;
  catalog: CatalogMenu[];
  stock: Record<string, StockRow[]>;
  events: EventOption[];
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [eventName, setEventName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [cateringEventId, setCateringEventId] = useState("");
  const [notes, setNotes] = useState("");
  const [paxText, setPaxText] = useState("");
  const [category, setCategory] = useState("");
  const [weeks, setWeeks] = useState<number[]>([]);
  const [sessions, setSessions] = useState<string[]>([]);
  const [combine, setCombine] = useState(false);
  const [recipeKeys, setRecipeKeys] = useState<string[]>([]);
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const [edits, setEdits] = useState<Record<string, Override>>({});
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [printOnly, setPrintOnly] = useState<"breakdown" | "purchase" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pax = Number(paxText);
  const paxValid = Number.isInteger(pax) && pax > 0;

  const companyCatalog = useMemo(() => catalog.filter((m) => m.companyId === companyId), [catalog, companyId]);
  const planMenus = useMemo(() => companyCatalog.filter((m) => m.sourceType === "menu_plan"), [companyCatalog]);
  const recipes = useMemo(() => companyCatalog.filter((m) => m.sourceType === "recipe"), [companyCatalog]);
  const mode: "weekly" | "recipes" = planMenus.length > 0 ? "weekly" : "recipes";

  const categories = useMemo(() => [...new Set(planMenus.map((m) => m.category))], [planMenus]);
  const activeCategory = category && categories.includes(category) ? category : categories[0] ?? "";
  const categoryMenus = useMemo(() => planMenus.filter((m) => m.category === activeCategory), [planMenus, activeCategory]);
  const availableWeeks = useMemo(() => [...new Set(categoryMenus.map((m) => m.week).filter((w): w is number => w !== null))].sort((a, b) => a - b), [categoryMenus]);
  const availableSessions = useMemo(
    () => [...new Set(categoryMenus.filter((m) => weeks.length === 0 || (m.week !== null && weeks.includes(m.week))).map((m) => m.meal).filter((s): s is string => !!s))].sort((a, b) => sessionRank(a) - sessionRank(b)),
    [categoryMenus, weeks],
  );

  /** What will be calculated: one group per week + session (default), or one combined group when the user asks for it. */
  const groups: Group[] = useMemo(() => {
    if (mode === "recipes") {
      const menus = recipeKeys.map((k) => recipes.find((r) => r.key === k)).filter((m): m is CatalogMenu => !!m);
      return menus.length ? [{ id: "recipes", label: "Recipes", category: null, weeks: [], sessions: [], menus }] : [];
    }
    const targets: Group[] = [];
    for (const w of [...weeks].sort((a, b) => a - b)) {
      for (const s of [...sessions].sort((a, b) => sessionRank(a) - sessionRank(b))) {
        const menus = categoryMenus.filter((m) => m.week === w && m.meal === s);
        if (menus.length) targets.push({ id: `w${w}-${s}`, label: `${activeCategory} · Week ${w} · ${sessionLabel(s)}`, category: activeCategory, weeks: [w], sessions: [s], menus });
      }
    }
    if (!combine || targets.length <= 1) return targets;
    // combined: every dish once (the same dish is never counted twice)
    const seen = new Set<string>();
    const menus = targets.flatMap((t) => t.menus).filter((m) => (seen.has(m.key) ? false : (seen.add(m.key), true)));
    return [
      {
        id: "combined",
        label: `${activeCategory} · ${[...new Set(targets.flatMap((t) => t.weeks))].map((w) => `Week ${w}`).join(", ")} · ${[...new Set(targets.flatMap((t) => t.sessions))].map(sessionLabel).join(", ")} (combined)`,
        category: activeCategory,
        weeks: [...new Set(targets.flatMap((t) => t.weeks))],
        sessions: [...new Set(targets.flatMap((t) => t.sessions))],
        menus,
      },
    ];
  }, [mode, recipeKeys, recipes, weeks, sessions, categoryMenus, activeCategory, combine]);

  const missingTargets = useMemo(() => {
    if (mode !== "weekly") return [];
    const out: string[] = [];
    for (const w of weeks) for (const s of sessions) if (!categoryMenus.some((m) => m.week === w && m.meal === s)) out.push(`Week ${w} ${sessionLabel(s)}`);
    return out;
  }, [mode, weeks, sessions, categoryMenus]);

  const stockMap: StockMap = useMemo(() => new Map((stock[companyId] ?? []).map(([n, q, u]) => [normaliseName(n), { quantity: q, unit: u }])), [stock, companyId]);

  const results = useMemo(
    () =>
      groups.map((g) => {
        const menus: SelectedMenu[] = g.menus.map((m) => ({ key: m.key, label: m.name, lines: m.lines }));
        return { group: g, items: stage >= 2 && paxValid ? consolidate(menus, pax, { stock: stockMap }) : [] };
      }),
    [groups, stage, paxValid, pax, stockMap],
  );

  function touch() {
    // the numbers behind the edited "Purchase Qty" cells change, so edits are cleared
    setEdits({});
  }
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  function pickEvent(id: string) {
    setCateringEventId(id);
    const ev = events.find((e) => e.id === id);
    if (!ev) return;
    setEventName(ev.event_name);
    setEventDate(ev.event_date);
    setCustomerName(ev.customer_name ?? "");
    if (ev.pax_count) setPaxText(String(ev.pax_count));
    touch();
  }

  function generateIngredients() {
    setError(null);
    if (!paxValid) return setError("Enter the required pax (a whole number above 0).");
    if (groups.length === 0) return setError(mode === "weekly" ? "Select a week and a meal session that has a menu." : "Select at least one recipe.");
    setStage((s) => (s < 1 ? 1 : s));
  }

  function generatePurchaseList() {
    generateIngredients();
    if (!paxValid || groups.length === 0) return;
    setStage(2);
  }

  function printSection(which: "breakdown" | "purchase") {
    setPrintOnly(which);
    setTimeout(() => {
      window.print();
      setPrintOnly(null);
    }, 80);
  }

  async function save() {
    setError(null);
    if (!eventName.trim()) return setError("Enter the event / project name before saving.");
    if (stage < 2) return setError("Click Generate Purchase List first.");
    setSaving(true);
    const savedIds: string[] = [];
    for (const { group, items } of results) {
      const overrides: Record<string, { finalQuantity?: number | null; remark?: string; status?: string }> = {};
      for (const it of items) {
        const e = edits[`${group.id}|${it.key}`];
        if (!e) continue;
        const o: { finalQuantity?: number | null; remark?: string; status?: string } = {};
        if (e.final !== undefined) o.finalQuantity = e.final.trim() === "" ? null : Number(e.final);
        if (e.remark) o.remark = e.remark;
        if (e.status) o.status = e.status;
        if (Object.keys(o).length) overrides[it.key] = o;
      }
      const result = await createPurchaseList({
        companyId,
        eventName,
        customerName,
        eventDate: eventDate || undefined,
        mealSession: group.sessions.length === 1 && MEAL_SESSIONS.includes(group.sessions[0]) ? group.sessions[0] : undefined,
        requiredPax: pax,
        cateringEventId: cateringEventId || undefined,
        notes,
        menuCategory: group.category ?? undefined,
        weekNumbers: group.weeks,
        mealSessions: group.sessions,
        menus: group.menus.map((m) => ({ sourceType: m.sourceType, sourceId: m.sourceId })),
        overrides,
      });
      if (!result.ok) {
        setSaving(false);
        return setError(`${group.label}: ${result.error ?? "could not save."}${savedIds.length ? ` (${savedIds.length} list(s) were already saved.)` : ""}`);
      }
      savedIds.push(result.id!);
    }
    setSaving(false);
    router.push(savedIds.length === 1 ? `/kitchen/purchase-lists/${savedIds[0]}` : "/kitchen/purchase-lists");
    router.refresh();
  }

  const eventsForCompany = events.filter((e) => e.company_id === companyId);
  const flaggedDishes = groups.flatMap((g) => g.menus).filter((m) => reviewReasons(m).length > 0);

  return (
    <div className="flex flex-col gap-5">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger print:hidden">{error}</div>}

      <div className="rounded-xl border border-border bg-surface p-5 shadow-sm print:hidden">
        <div className="text-[15px] font-bold text-text">Step 1 · Select the menu</div>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Company *</label>
            <select
              value={companyId}
              onChange={(e) => {
                setCompanyId(e.target.value);
                setCategory("");
                setWeeks([]);
                setSessions([]);
                setRecipeKeys([]);
                setCateringEventId("");
                setStage(0);
                touch();
              }}
              className={inputClass}
            >
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Required pax *</label>
            <input type="number" min="1" value={paxText} onChange={(e) => { setPaxText(e.target.value); touch(); }} className={inputClass} placeholder="e.g. 100" />
          </div>

          {mode === "weekly" ? (
            <>
              <div className="sm:col-span-2">
                <label className={labelClass}>Menu category *</label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {categories.map((c) => (
                    <button key={c} type="button" className={chip(c === activeCategory)} onClick={() => { setCategory(c); setWeeks([]); setSessions([]); setStage(0); touch(); }}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label className={labelClass}>Week * <span className="font-normal text-text-muted">(pick one or more)</span></label>
                  <span className="flex gap-3 text-xs font-semibold text-primary">
                    <button type="button" onClick={() => { setWeeks(availableWeeks); setStage(0); touch(); }}>All weeks</button>
                    <button type="button" className="text-text-muted" onClick={() => { setWeeks([]); setStage(0); touch(); }}>Clear</button>
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {availableWeeks.map((w) => (
                    <button key={w} type="button" className={chip(weeks.includes(w))} onClick={() => { setWeeks((l) => toggle(l, w)); setStage(0); touch(); }}>Week {w}</button>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label className={labelClass}>Meal session * <span className="font-normal text-text-muted">(pick one, or several for a whole day)</span></label>
                  <span className="flex gap-3 text-xs font-semibold text-primary">
                    <button type="button" onClick={() => { setSessions(availableSessions); setStage(0); touch(); }}>Whole day (all sessions)</button>
                    <button type="button" className="text-text-muted" onClick={() => { setSessions([]); setStage(0); touch(); }}>Clear</button>
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {availableSessions.map((s) => (
                    <button key={s} type="button" className={chip(sessions.includes(s))} onClick={() => { setSessions((l) => toggle(l, s)); setStage(0); touch(); }}>{sessionLabel(s)}</button>
                  ))}
                  {availableSessions.length === 0 && <span className="text-xs text-text-muted">No meal sessions found for this category.</span>}
                </div>
              </div>
              {groups.length > 1 && (
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border-strong px-3 py-2 text-[13px] sm:col-span-2">
                  <input type="checkbox" checked={combine} onChange={(e) => { setCombine(e.target.checked); setStage(0); touch(); }} className="mt-0.5 accent-[var(--color-primary)]" />
                  <span>
                    <span className="font-semibold text-text">Combine into one purchasing list</span>
                    <span className="block text-xs text-text-muted">Off by default: each week and meal session gets its own list. Tick this only when you want one combined list to buy from.</span>
                  </span>
                </label>
              )}
            </>
          ) : (
            <div className="sm:col-span-2">
              <label className={labelClass}>Recipes * ({recipeKeys.length} selected)</label>
              <p className="mt-0.5 text-xs text-text-muted">This company has no weekly menu schedule, only recipes. Pick the recipes to buy for.</p>
              <RecipePicker
                recipes={recipes.map((r) => ({ key: r.key, name: r.name, ingredientCount: r.lines.length }))}
                selected={recipeKeys}
                onToggle={(key) => { setRecipeKeys((l) => toggle(l, key)); setStage(0); touch(); }}
                onClear={() => { setRecipeKeys([]); setStage(0); touch(); }}
              />
            </div>
          )}
        </div>

        <details className="mt-4">
          <summary className="cursor-pointer text-[13px] font-semibold text-primary">Event details (needed to save the list)</summary>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass}>Link to a catering event (optional)</label>
              <select value={cateringEventId} onChange={(e) => pickEvent(e.target.value)} className={inputClass}>
                <option value="">Not linked — type the details</option>
                {eventsForCompany.map((e) => <option key={e.id} value={e.id}>{e.event_name} · {e.event_date}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Event / project name *</label>
              <input value={eventName} onChange={(e) => setEventName(e.target.value)} maxLength={200} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Customer</label>
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Event date</label>
              <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Notes</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
            </div>
          </div>
        </details>
      </div>

      {groups.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm print:hidden">
          <div className="text-[15px] font-bold text-text">Step 2 · The menu for this selection</div>
          <p className="mt-0.5 text-xs text-text-muted">These dishes come straight from the menu data. Nothing needs to be picked one by one.</p>
          {missingTargets.length > 0 && <p className="mt-2 text-xs font-semibold text-warning">No menu in the workbook for: {missingTargets.join(", ")}.</p>}
          <div className="mt-3 flex flex-col gap-3">
            {groups.map((g) => (
              <div key={g.id} className="rounded-lg border border-border p-3">
                <div className="text-[13px] font-bold text-text">{g.label} <span className="font-normal text-text-muted">· {g.menus.length} dish(es)</span></div>
                <div className="mt-1.5 flex flex-col gap-0.5 text-[13px]">
                  {g.menus.map((m) => {
                    const reasons = reviewReasons(m);
                    return (
                      <div key={m.key} className="flex flex-wrap items-center gap-2">
                        <span className="text-text">{m.name}</span>
                        <span className="text-xs text-text-muted">{m.lines.length} ingredient(s)</span>
                        {reasons.length > 0 && <span className="rounded bg-warning-bg px-1.5 py-0.5 text-[10.5px] font-bold text-warning">Needs review: {reasons.join(", ")}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={generateIngredients} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white">Generate Ingredient List</button>
            <button type="button" onClick={generatePurchaseList} className="rounded-lg border border-primary bg-surface px-5 py-2.5 text-[13.5px] font-semibold text-primary">Generate Purchase List</button>
          </div>
        </div>
      )}

      {stage >= 1 && paxValid && groups.length > 0 && (
        <div className={`rounded-xl border border-border bg-surface p-5 shadow-sm ${printOnly === "purchase" ? "print:hidden" : ""}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-[15px] font-bold text-text">Ingredient breakdown by dish — {pax.toLocaleString()} pax</div>
              <div className="text-xs text-text-muted">{companies.find((c) => c.id === companyId)?.name}{mode === "weekly" ? ` · ${activeCategory}` : ""}</div>
            </div>
            <button type="button" onClick={() => printSection("breakdown")} className="rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-text print:hidden">Print breakdown</button>
          </div>
          {flaggedDishes.length > 0 && <p className="mt-2 text-xs font-semibold text-warning print:hidden">{flaggedDishes.length} dish(es) have incomplete data (blank quantity or unit): those lines are shown as blank, never as zero.</p>}
          {groups.map((g) => (
            <div key={g.id} className="mt-4">
              <div className="text-[13px] font-bold text-text">{g.label}</div>
              <div className="mt-1.5 overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[760px] border-collapse text-left">
                  <thead className="bg-surface-alt">
                    <tr className="text-[10.5px] font-bold uppercase tracking-wide text-text-muted">
                      <th className="px-3 py-2">Dish</th>
                      <th className="px-3 py-2">Ingredient</th>
                      <th className="px-3 py-2">Original qty</th>
                      <th className="px-3 py-2">Original pax</th>
                      <th className="px-3 py-2">Required qty</th>
                      <th className="px-3 py-2">Unit</th>
                      <th className="px-3 py-2">Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.menus.flatMap((m) =>
                      m.lines.length === 0
                        ? [<tr key={`${m.key}-empty`} className="border-t border-border text-[12.5px]"><td className="px-3 py-2 font-semibold text-text">{m.name}</td><td colSpan={6} className="px-3 py-2 text-warning">No ingredients recorded — needs review</td></tr>]
                        : m.lines.map((l, i) => {
                            const req = scaleQuantity(l.baseQuantity, l.basePax, pax);
                            return (
                              <tr key={`${m.key}-${i}`} className="border-t border-border text-[12.5px]">
                                <td className="px-3 py-1.5 font-semibold text-text">{i === 0 ? m.name : ""}</td>
                                <td className="px-3 py-1.5 text-text">{l.name}</td>
                                <td className="px-3 py-1.5 text-text-secondary">{l.baseQuantity === null ? "—" : formatQty(l.baseQuantity, 3)}</td>
                                <td className="px-3 py-1.5 text-text-secondary">{l.basePax}</td>
                                <td className="px-3 py-1.5 font-semibold text-text">{req === null ? <span className="text-warning">blank — confirm</span> : formatQty(req, 3)}</td>
                                <td className="px-3 py-1.5 text-text-secondary">{l.unit ?? "—"}</td>
                                <td className="px-3 py-1.5 text-text-muted">{l.remark ?? ""}</td>
                              </tr>
                            );
                          }),
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {stage >= 2 && paxValid && results.some((r) => r.items.length > 0) && (
        <div className={`rounded-xl border border-border bg-surface p-5 shadow-sm ${printOnly === "breakdown" ? "print:hidden" : ""}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="text-[15px] font-bold text-text">Consolidated purchase list — {pax.toLocaleString()} pax</div>
            <button type="button" onClick={() => printSection("purchase")} className="rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-text print:hidden">Print purchase list</button>
          </div>
          <p className="mt-1 text-xs text-text-muted print:hidden">
            &quot;Total required&quot; comes from the recipes and cannot be edited. Change &quot;Purchase qty&quot; if you must buy a different amount. Whole items (eggs, pieces) are rounded up and shown separately. Stock is not assumed: it shows Not Checked unless stock has really been recorded.
            Changing the pax or the menu clears edited purchase quantities.
          </p>
          {results.map(({ group, items }) => (
            <div key={group.id} className="mt-4">
              <div className="text-[13px] font-bold text-text">{group.label} <span className="font-normal text-text-muted">· {items.length} ingredient(s), {items.filter((i) => i.flags.length).length} to check</span></div>
              <div className="mt-1.5 overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[820px] border-collapse text-left">
                  <thead className="bg-surface-alt">
                    <tr className="text-[10.5px] font-bold uppercase tracking-wide text-text-muted">
                      <th className="px-3 py-2">No.</th>
                      <th className="px-3 py-2">Ingredient</th>
                      <th className="px-3 py-2">Total required</th>
                      <th className="px-3 py-2">Unit</th>
                      <th className="px-3 py-2">Purchase qty</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, n) => {
                      const ek = `${group.id}|${it.key}`;
                      const e = edits[ek] ?? {};
                      return (
                        <Fragment key={it.key}>
                          <tr className="border-t border-border align-top text-[12.5px]">
                            <td className="px-3 py-2 text-text-muted">{n + 1}</td>
                            <td className="px-3 py-2">
                              <button type="button" onClick={() => setOpenItem(openItem === ek ? null : ek)} className="text-left font-semibold text-text hover:text-primary print:pointer-events-none">
                                {openItem === ek ? "▾" : "▸"} {it.name}
                              </button>
                              <div className="text-[10.5px] text-text-muted">{STOCK_STATUS_LABEL[it.stockStatus]}{it.stockAvailable !== null ? ` · ${formatQty(it.stockAvailable)} ${it.unit ?? ""} in stock` : ""}</div>
                              {it.flags.map((f, i) => <div key={i} className="mt-0.5 text-[10.5px] font-semibold text-warning">⚠ {f}</div>)}
                            </td>
                            <td className="px-3 py-2 font-semibold text-text">{formatQty(it.calculated, 3)}</td>
                            <td className="px-3 py-2 text-text-secondary">{it.unit ?? "—"}</td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={e.final ?? (it.suggested === null ? "" : String(it.suggested))}
                                onChange={(ev) => setEdits((s) => ({ ...s, [ek]: { ...s[ek], final: ev.target.value } }))}
                                className="h-8 w-24 rounded border border-border-strong px-2 text-[12.5px] outline-none print:border-0"
                                placeholder={it.suggested === null ? "enter" : undefined}
                              />
                              {it.roundingNote && <div className="mt-0.5 text-[10.5px] text-text-muted">{it.roundingNote}</div>}
                            </td>
                            <td className="px-3 py-2">
                              <select value={e.status ?? "pending"} onChange={(ev) => setEdits((s) => ({ ...s, [ek]: { ...s[ek], status: ev.target.value } }))} className="h-8 rounded border border-border-strong px-1 text-[12.5px] outline-none print:border-0">
                                {PURCHASE_ITEM_STATUSES.map((s) => <option key={s} value={s}>{PURCHASE_ITEM_STATUS_LABEL[s]}</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-2"><input value={e.remark ?? ""} onChange={(ev) => setEdits((s) => ({ ...s, [ek]: { ...s[ek], remark: ev.target.value } }))} className="h-8 w-36 rounded border border-border-strong px-2 text-[12.5px] outline-none print:border-0" /></td>
                          </tr>
                          {openItem === ek && (
                            <tr className="bg-surface-alt text-[12px]">
                              <td />
                              <td colSpan={6} className="px-3 py-2">
                                <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-text-muted">Which dishes need it</div>
                                {it.breakdown.map((b, i) => (
                                  <div key={i} className="py-0.5 text-text-secondary">
                                    <span className="font-semibold text-text">{b.menuLabel}</span>: {b.baseQuantity === null ? "blank" : `${formatQty(b.baseQuantity, 3)} ${b.unit ?? ""} per ${b.basePax} pax`} → <span className="font-semibold text-text">{b.quantity === null ? "—" : `${formatQty(b.quantity, 3)} ${b.unit ?? ""}`}</span>
                                    {b.remark && <span className="ml-2 text-text-muted">({b.remark})</span>}
                                    {b.note && <span className="ml-2 text-warning">⚠ {b.note}</span>}
                                  </div>
                                ))}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2.5 print:hidden">
            <span className="mr-auto text-xs text-text-muted">{results.length > 1 ? `${results.length} separate lists will be saved.` : "1 list will be saved."}</span>
            <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">Cancel</button>
            <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
              {saving ? "Saving..." : results.length > 1 ? `Save ${results.length} Purchase Lists` : "Save Purchase List"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
