"use client";

import { useMemo, useRef, useState } from "react";
import { autoMatch, candidatesFor, type Candidate, type RecipeRef } from "@/lib/kitchenAi/match";
import { isBoughtIn } from "@/lib/kitchenPurchase/shared";
import { display, formatQty } from "@/lib/kitchenAi/units";
import { calculateEoIngredients } from "@/lib/kitchenAi/eoActions";
import { buildEoState } from "@/lib/kitchenAi/eoState";
import type { EoSession } from "@/lib/kitchenAi/eoMenu";
import type { CalcResult, ConsolRow, KState } from "@/lib/kitchenAi/types";

type Row = { key: string; name: string; pax: string; on: boolean; text: string };
type Result = { calc: CalcResult; state: KState };

const input = "h-10 w-full rounded-lg border border-border-strong bg-white px-3 text-[14px] outline-none focus:border-primary";
const btn = "h-10 rounded-lg border border-border-strong bg-white px-4 text-[13.5px] font-bold text-text hover:bg-surface-alt disabled:opacity-60";

let counter = 0;
const newKey = () => `r${Date.now().toString(36)}${counter++}`;
const toRow = (s: EoSession): Row => ({ key: newKey(), name: s.name, pax: s.pax ? String(s.pax) : "", on: true, text: s.dishes.join("\n") });
const dishesOf = (text: string) => Array.from(new Set(text.split("\n").map((l) => l.trim()).filter(Boolean)));

/**
 * Ingredient list from an Event Order: the menu (from the event, or read from an uploaded Word / PDF file) is shown as a list of
 * dishes with the pax. Each dish is matched to a company recipe, which the person can change. The button works out the ingredients.
 */
export function EventIngredientGenerator({
  companyId,
  companyName,
  event,
  initialSessions,
  recipes,
}: {
  companyId: string;
  companyName: string;
  event: { id: string; name: string; date: string; pax: number } | null;
  initialSessions: EoSession[];
  recipes: RecipeRef[];
}) {
  const [rows, setRows] = useState<Row[]>(() => initialSessions.map(toRow));
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [openAll, setOpenAll] = useState<string | null>(null);
  const [compareStock, setCompareStock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // the match of every dish is worked out once per change of the menu text (not on every keystroke elsewhere)
  const dishKey = rows.flatMap((r) => dishesOf(r.text)).join("\n");
  const matches = useMemo(() => {
    const m = new Map<string, { auto: string | null; cands: Candidate[] }>();
    for (const dish of dishKey.split("\n").filter(Boolean)) {
      if (!m.has(dish)) m.set(dish, { auto: isBoughtIn(dish) ? null : autoMatch(dish, recipes)?.recipeId ?? null, cands: candidatesFor(dish, recipes, 6) });
    }
    return m;
  }, [dishKey, recipes]);
  const matchOf = (dish: string) => matches.get(dish) ?? { auto: null, cands: [] as Candidate[] };
  const chosenRecipe = (rowKey: string, dish: string): string | null => {
    const k = `${rowKey}|${dish}`;
    return k in picked ? picked[k] || null : matchOf(dish).auto;
  };
  const recipeName = (id: string | null) => recipes.find((r) => r.id === id)?.name ?? "";

  const update = (key: string, patch: Partial<Row>) => setRows((x) => x.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function readFile(file: File) {
    setReading(true);
    setError(null);
    setNote(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (event?.pax) form.append("fallbackPax", String(event.pax));
      const res = await fetch("/kitchen/event-ingredients/read", { method: "POST", body: form });
      const data = (await res.json()) as { ok: boolean; error?: string; fileName?: string; sessions?: EoSession[] };
      if (!data.ok || !data.sessions) setError(data.error ?? "This file could not be read.");
      else {
        setRows((x) => [...x, ...data.sessions!.map(toRow)]);
        setNote(`Read ${data.sessions.length} menu group${data.sessions.length === 1 ? "" : "s"} from ${data.fileName}. Check the dishes and pax below before you generate.`);
        setResult(null);
      }
    } catch {
      setError("The file could not be sent. Please try again.");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const active = rows.filter((r) => r.on && dishesOf(r.text).length > 0);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        companyId,
        companyName,
        eventId: event?.id ?? null,
        eventName: event?.name ?? null,
        eventDate: event?.date ?? null,
        compareStock,
        sessions: active.map((r) => ({
          name: r.name || "Menu",
          pax: Number(r.pax) > 0 ? Number(r.pax) : null,
          // a dish bought ready-made (fruit, kuih, mineral water ...) needs no ingredients unless a recipe was chosen for it
          items: dishesOf(r.text)
            .map((d) => ({ name: d, recipeId: chosenRecipe(r.key, d), skip: isBoughtIn(d) && !chosenRecipe(r.key, d) }))
            .filter((i) => !i.skip)
            .map((i) => ({ name: i.name, recipeId: i.recipeId })),
        })),
      };
      const r = await calculateEoIngredients(payload);
      if (!r.ok) setError(r.error);
      else setResult({ calc: r.calc, state: buildEoState(payload) });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const unit = (r: { qty: number; family: ConsolRow["family"]; key: string }) => {
    const d = display({ qty: r.qty, family: r.family, key: r.key });
    return `${formatQty(d.qty)} ${d.unit}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="text-[15px] font-bold text-text">Upload the Event Order (Word or PDF)</div>
        <p className="mt-0.5 text-[13px] text-text-secondary">The dishes and pax in the file are read and added below. You can correct them before the ingredients are worked out.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".docx,.pdf,.txt" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} className="hidden" id="eo-file" />
          <label htmlFor="eo-file" className={`${btn} inline-flex cursor-pointer items-center ${reading ? "opacity-60" : ""}`}>
            {reading ? "Reading the file..." : "Choose Word / PDF file"}
          </label>
          <button type="button" className={btn} onClick={() => setRows((x) => [...x, { key: newKey(), name: "Menu", pax: event?.pax ? String(event.pax) : "", on: true, text: "" }])}>
            + Type a menu
          </button>
        </div>
        {note && <p className="mt-2 text-[13px] text-text-secondary">{note}</p>}
      </div>

      {rows.length === 0 && <div className="rounded-xl bg-surface-alt px-4 py-3 text-[14px] text-text-secondary">There is no menu yet. Upload the Event Order, or type a menu.</div>}

      {rows.map((r) => {
        const dishes = dishesOf(r.text);
        return (
          <div key={r.key} className={`rounded-xl border bg-surface p-4 shadow-sm ${r.on ? "border-border" : "border-border opacity-60"}`}>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex items-center gap-2 pb-2 text-[13px] font-semibold text-text">
                <input type="checkbox" checked={r.on} onChange={(e) => update(r.key, { on: e.target.checked })} className="h-5 w-5 accent-[#a85d6b]" />
                Use
              </label>
              <div className="min-w-[200px] flex-1">
                <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Menu / session</div>
                <input value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} className={input} />
              </div>
              <div className="w-28">
                <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Pax</div>
                <input value={r.pax} inputMode="numeric" onChange={(e) => update(r.key, { pax: e.target.value.replace(/[^0-9]/g, "") })} className={input} />
              </div>
              <button type="button" className={btn} onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}>
                Remove
              </button>
            </div>

            <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_1.6fr]">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Dishes (one per line)</div>
                <textarea value={r.text} onChange={(e) => update(r.key, { text: e.target.value })} rows={Math.min(14, Math.max(4, dishes.length + 1))} className="mt-1 w-full rounded-lg border border-border-strong bg-white p-3 text-[14px] outline-none focus:border-primary" />
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Recipe used for each dish</div>
                <ul className="mt-1 flex flex-col gap-2">
                  {dishes.map((d) => {
                    const k = `${r.key}|${d}`;
                    const m = matchOf(d);
                    const cur = chosenRecipe(r.key, d);
                    const bought = isBoughtIn(d);
                    return (
                      <li key={d} className="rounded-lg border border-border px-3 py-2">
                        <div className="text-[14px] font-semibold text-text">{d}</div>
                        {openAll === k ? (
                          <select
                            autoFocus
                            value={cur ?? ""}
                            onChange={(e) => {
                              setPicked((p) => ({ ...p, [k]: e.target.value }));
                              setOpenAll(null);
                            }}
                            className={`${input} mt-1`}
                            aria-label={`Recipe for ${d}`}
                          >
                            <option value="">No recipe</option>
                            {recipes.map((rec) => (
                              <option key={rec.id} value={rec.id}>
                                {rec.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <select
                            value={cur ?? ""}
                            onChange={(e) => (e.target.value === "__all" ? setOpenAll(k) : setPicked((p) => ({ ...p, [k]: e.target.value })))}
                            className={`${input} mt-1`}
                            aria-label={`Recipe for ${d}`}
                          >
                            <option value="">{bought ? "Bought ready — no recipe needed" : "No recipe chosen"}</option>
                            {cur && !m.cands.some((c) => c.recipeId === cur) && <option value={cur}>{recipeName(cur)}</option>}
                            {m.cands.map((c) => (
                              <option key={c.recipeId} value={c.recipeId}>
                                {c.name}
                              </option>
                            ))}
                            <option value="__all">Choose another recipe...</option>
                          </select>
                        )}
                        {!cur && !bought && <div className="mt-1 text-[12.5px] text-warning">No recipe matched. Choose one, or add the recipe in Recipes first.</div>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        );
      })}

      <label className="flex items-center gap-2 text-[13.5px] text-text">
        <input type="checkbox" checked={compareStock} onChange={(e) => setCompareStock(e.target.checked)} className="h-5 w-5 accent-[#a85d6b]" />
        Also compare with the stock in the store (shows what is enough and what must be bought)
      </label>

      <button type="button" disabled={busy || active.length === 0} onClick={generate} className="h-14 w-full rounded-xl bg-primary text-[16px] font-extrabold text-white hover:bg-primary-hover disabled:opacity-60">
        {busy ? "Working out the ingredients..." : "Generate ingredient list"}
      </button>
      {error && (
        <div role="alert" className="rounded-lg bg-danger-bg px-4 py-3 text-[14px] text-danger">
          {error}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[18px] font-extrabold text-text">Ingredient list</h2>
            <div className="flex gap-2">
              <button type="button" className={btn} onClick={async () => (await import("@/lib/kitchenAi/exportXlsx")).exportKitchenList(result.state, result.calc)}>
                Download Excel
              </button>
              <button type="button" className={btn} onClick={async () => (await import("@/lib/kitchenAi/exportPdf")).downloadKitchenPdf(result.state, result.calc, null)}>
                Download PDF
              </button>
            </div>
          </div>

          {result.calc.needsData.length > 0 && (
            <div className="rounded-lg border border-border bg-surface-alt px-4 py-3 text-[13.5px] text-warning">
              <b>These dishes have no quantities</b> (no recipe, an empty recipe, or no pax). They are not in the list below:
              <ul className="mt-1 list-disc pl-5">
                {result.calc.needsData.map((n, i) => (
                  <li key={i}>
                    {n.itemName} ({n.sessionName}) — {n.reason === "pax" ? "pax missing" : n.reason === "recipe_empty" ? "the recipe has no ingredients" : "recipe needed"}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-text-muted">
                  <th className="py-2 pr-3">Ingredient</th>
                  <th className="py-2 pr-3">Total needed</th>
                  {result.state.stockCompared && <th className="py-2 pr-3">In stock</th>}
                  {result.state.stockCompared && <th className="py-2">To buy</th>}
                </tr>
              </thead>
              <tbody>
                {result.calc.combined.map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-b-0">
                    <td className="py-2 pr-3 font-semibold text-text">{row.name}</td>
                    <td className="py-2 pr-3">{unit(row)}</td>
                    {result.state.stockCompared && <td className="py-2 pr-3">{row.stock?.known ? unit({ qty: row.stock.qty, family: row.family, key: row.key }) : "not in stock list"}</td>}
                    {result.state.stockCompared && <td className="py-2">{row.stock?.known ? ((row.shortage ?? 0) > 1e-9 ? unit({ qty: row.shortage ?? 0, family: row.family, key: row.key }) : "enough") : unit(row)}</td>}
                  </tr>
                ))}
                {result.calc.combined.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-3 text-text-secondary">
                      No ingredient could be worked out. Choose a recipe for the dishes above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {result.calc.sessions.length > 1 &&
            result.calc.sessions.map((s) => (
              <details key={s.id} className="rounded-lg border border-border px-3 py-2">
                <summary className="cursor-pointer text-[14px] font-bold text-text">
                  {s.name} — {s.pax ?? "no"} pax
                </summary>
                <ul className="mt-2 grid gap-1 text-[13.5px] text-text-secondary sm:grid-cols-2">
                  {s.consolidated.map((row, i) => (
                    <li key={i}>
                      {row.name}: <b className="text-text">{unit(row)}</b>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          <p className="text-[12.5px] text-text-muted">Quantity = recipe quantity ÷ recipe yield × pax. Nothing is saved: download or print the list.</p>
        </div>
      )}
    </div>
  );
}
