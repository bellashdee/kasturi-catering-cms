"use client";

import { useMemo, useState } from "react";
import { errorMessage } from "@/lib/actionResult";
import { bestSupplierItem, ingredientKey, rankSupplierItems, type SupplierItemOption } from "@/lib/purchasePlanner/shared";
import { clearIngredientMatch, saveIngredientMatch, saveIngredientMatches } from "@/lib/purchasePlanner/matchActions";
import { SupplierItemPicker } from "@/components/procurement/SupplierItemPicker";

type Filter = "all" | "saved" | "suggested" | "none";

const chip = (active: boolean) => `rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${active ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text hover:bg-surface-alt"}`;
const btn = "rounded-md border border-border-strong bg-white px-2.5 py-1 text-[12px] font-semibold text-text hover:border-primary hover:text-primary disabled:opacity-50";

/**
 * Every ingredient used in the recipes with the supplier item it is bought as. The name match is shown as a suggestion; a person can
 * choose another item and save it, and the saved item is what the purchase lists use from then on.
 */
export function IngredientMatching({ companyId, ingredients, items, savedRows }: { companyId: string; ingredients: string[]; items: SupplierItemOption[]; savedRows: { ingredientKey: string; optionKey: string }[] }) {
  const [saved, setSaved] = useState<Map<string, string>>(() => new Map(savedRows.map((r) => [r.ingredientKey, r.optionKey])));
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);

  const rows = useMemo(
    () =>
      ingredients.map((name) => {
        const key = ingredientKey(name);
        const savedOption = saved.has(key) ? (byKey.get(saved.get(key)!) ?? null) : null;
        const suggestion = bestSupplierItem(name, items);
        const pickedKey = chosen[key];
        const picked = pickedKey ? (byKey.get(pickedKey) ?? null) : null;
        const current = picked ?? savedOption ?? suggestion;
        const status: "saved" | "suggested" | "none" = picked ? "suggested" : savedOption ? "saved" : suggestion ? "suggested" : "none";
        const changed = !!picked && picked.key !== savedOption?.key;
        return { name, key, current, savedOption, suggestion, status, changed, ranked: rankSupplierItems(name, items, 8, saved).map((x) => x.option) };
      }),
    [ingredients, items, saved, chosen, byKey],
  );

  const counts = { all: rows.length, saved: rows.filter((r) => r.status === "saved" && !r.changed).length, suggested: rows.filter((r) => r.status === "suggested").length, none: rows.filter((r) => r.status === "none").length };
  const shown = rows.filter((r) => {
    if (filter === "saved" && !(r.status === "saved" && !r.changed)) return false;
    if (filter === "suggested" && r.status !== "suggested") return false;
    if (filter === "none" && r.status !== "none") return false;
    const words = search.trim().toUpperCase().split(/\s+/).filter(Boolean);
    return words.every((w) => `${r.name} ${r.current?.description ?? ""}`.toUpperCase().includes(w));
  });

  const toInput = (r: (typeof rows)[number]) => (r.current ? { ingredient: r.name, supplierId: r.current.supplierId, description: r.current.description, uom: r.current.uom } : null);

  async function saveOne(r: (typeof rows)[number]) {
    const input = toInput(r);
    if (!input) return;
    setBusy(r.key);
    setError(null);
    setNotice(null);
    try {
      const res = await saveIngredientMatch(companyId, input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved((m) => new Map(m).set(r.key, r.current!.key));
      setChosen((c) => {
        const next = { ...c };
        delete next[r.key];
        return next;
      });
    } catch (err) {
      setError(errorMessage(err, "Could not save the match."));
    } finally {
      setBusy(null);
    }
  }

  async function clearOne(r: (typeof rows)[number]) {
    setBusy(r.key);
    setError(null);
    setNotice(null);
    try {
      const res = await clearIngredientMatch(companyId, r.name);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved((m) => {
        const next = new Map(m);
        next.delete(r.key);
        return next;
      });
      setChosen((c) => {
        const next = { ...c };
        delete next[r.key];
        return next;
      });
    } catch (err) {
      setError(errorMessage(err, "Could not remove the match."));
    } finally {
      setBusy(null);
    }
  }

  async function saveAllSuggested() {
    const todo = rows.filter((r) => r.status === "suggested" && r.current);
    if (todo.length === 0) return;
    if (!window.confirm(`Save the ${todo.length} suggested matches? You can still change or remove each one afterwards.`)) return;
    setBusy("all");
    setError(null);
    setNotice(null);
    try {
      const res = await saveIngredientMatches(companyId, todo.map((r) => toInput(r)!));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved((m) => {
        const next = new Map(m);
        for (const r of todo) next.set(r.key, r.current!.key);
        return next;
      });
      setChosen({});
      setNotice(`Saved: ${res.saved}`);
    } catch (err) {
      setError(errorMessage(err, "Could not save the matches."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "saved", "suggested", "none"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setFilter(k)} className={chip(filter === k)}>
            {`${k === "all" ? "All" : k === "saved" ? "Saved" : k === "suggested" ? "Suggested" : "Not matched"} (${counts[k]})`}
          </button>
        ))}
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ingredient or item..." className="h-9 w-64 rounded-lg border border-border-strong bg-white px-3 text-[13px] outline-none focus:border-primary" />
        <button type="button" disabled={busy !== null || counts.suggested === 0} onClick={saveAllSuggested} className="ml-auto rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
          {busy === "all" ? "Saving..." : `Save all suggested (${counts.suggested})`}
        </button>
      </div>
      {notice && <div role="status" className="rounded-lg border border-success/30 bg-success-bg px-3 py-2 text-[13px] text-success">{notice}</div>}
      {error && <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b border-border bg-surface-alt px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-text-muted">
          <div>Ingredient</div>
          <div>Supplier item</div>
          <div>Status</div>
          <div />
        </div>
        {shown.length === 0 && <div className="px-5 py-4 text-[13px] text-text-muted">Nothing to show.</div>}
        {shown.map((r) => (
          <div key={r.key} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] items-start gap-2 border-b border-border px-5 py-2.5 text-[13px] last:border-b-0">
            <div className="pt-2 font-semibold text-text">{r.name}</div>
            <div>
              <SupplierItemPicker ingredient={r.name} selected={r.current} suggestions={r.ranked} all={items} onPick={(key) => setChosen((c) => ({ ...c, [r.key]: key }))} />
              {r.current && <div className="mt-0.5 text-[11px] text-text-muted">{`${r.current.uom || "unit"} · latest price RM ${r.current.price.toFixed(2)}`}</div>}
            </div>
            <div className="pt-2">
              {r.changed ? <span className="font-semibold text-warning">Changed: not saved yet</span> : r.status === "saved" ? <span className="font-semibold text-success">Saved</span> : r.status === "suggested" ? <span className="font-semibold text-info">Suggested</span> : <span className="text-text-muted">Not matched</span>}
            </div>
            <div className="flex flex-wrap justify-end gap-1.5 pt-1">
              {(r.changed || r.status === "suggested") && r.current && (
                <button type="button" disabled={busy !== null} onClick={() => void saveOne(r)} className="rounded-md bg-primary px-2.5 py-1 text-[12px] font-bold text-white disabled:opacity-50">
                  {busy === r.key ? "Saving..." : "Save"}
                </button>
              )}
              {r.changed && (
                <button type="button" disabled={busy !== null} onClick={() => setChosen((c) => { const next = { ...c }; delete next[r.key]; return next; })} className={btn}>
                  Cancel
                </button>
              )}
              {r.savedOption && !r.changed && (
                <button type="button" disabled={busy !== null} onClick={() => void clearOne(r)} className={`${btn} text-danger`}>
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
