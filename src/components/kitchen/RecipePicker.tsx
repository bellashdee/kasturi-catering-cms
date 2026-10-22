"use client";

import { useMemo, useState } from "react";
import { RECIPE_CATEGORIES, recipeCategory } from "@/lib/kitchen/recipeCategory";

export type PickerRecipe = { key: string; name: string; ingredientCount: number };

const PAGE = 40;

/**
 * Choose recipes without a scroll box: pick a category (Ayam, Daging ...), then tick the recipes as buttons. What is already
 * chosen stays in a tray on top (each one can be removed with its ✕), whatever category or search is open.
 */
export function RecipePicker({ recipes, selected, onToggle, onClear }: { recipes: PickerRecipe[]; selected: string[]; onToggle: (key: string) => void; onClear: () => void }) {
  const [category, setCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const withCategory = useMemo(() => recipes.map((r) => ({ ...r, category: recipeCategory(r.name) })), [recipes]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: withCategory.length };
    for (const r of withCategory) c[r.category] = (c[r.category] ?? 0) + 1;
    return c;
  }, [withCategory]);
  const q = search.trim().toLowerCase();
  const shown = withCategory.filter((r) => (category === "all" || r.category === category) && (!q || r.name.toLowerCase().includes(q)));
  const visible = shown.slice(0, limit);
  const chosen = selected.map((k) => withCategory.find((r) => r.key === k)).filter((r): r is NonNullable<typeof r> => !!r);

  const tab = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${active ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text hover:bg-surface-alt"}`;

  return (
    <div className="mt-2 flex flex-col gap-3">
      <div className="rounded-lg border border-border bg-surface-alt px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12.5px] font-bold text-text">{`Chosen recipes (${chosen.length})`}</span>
          {chosen.length > 0 && (
            <button type="button" onClick={onClear} className="text-[12px] font-semibold text-danger">
              Clear all
            </button>
          )}
        </div>
        {chosen.length === 0 ? (
          <p className="mt-1 text-xs text-text-muted">Nothing chosen yet. Pick a category below, then tap the recipes.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chosen.map((r) => (
              <span key={r.key} className="inline-flex items-center gap-1.5 rounded-full bg-info-bg px-2.5 py-1 text-[12.5px] font-semibold text-primary">
                {r.name}
                <button type="button" aria-label={`Remove ${r.name}`} onClick={() => onToggle(r.key)} className="text-[14px] leading-none text-primary/70 hover:text-danger">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={tab(category === "all")} onClick={() => { setCategory("all"); setLimit(PAGE); }}>
          {`All (${counts.all ?? 0})`}
        </button>
        {RECIPE_CATEGORIES.filter((c) => (counts[c.key] ?? 0) > 0).map((c) => (
          <button key={c.key} type="button" className={tab(category === c.key)} onClick={() => { setCategory(c.key); setLimit(PAGE); }}>
            {`${c.label} (${counts[c.key]})`}
          </button>
        ))}
      </div>

      <input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setLimit(PAGE);
        }}
        className="h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
        placeholder="Search recipe name"
      />

      {visible.length === 0 ? (
        <p className="text-[13px] text-text-muted">No recipe matches.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {visible.map((r) => {
            const on = selected.includes(r.key);
            return (
              <button
                key={r.key}
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(r.key)}
                title={`${r.ingredientCount} ingredient(s)`}
                className={`rounded-lg border px-3 py-2 text-left text-[13px] font-semibold ${on ? "border-primary bg-info-bg text-primary" : "border-border-strong bg-surface text-text hover:bg-surface-alt"}`}
              >
                <span aria-hidden="true">{on ? "✓ " : ""}</span>
                {r.name}
              </button>
            );
          })}
        </div>
      )}
      {shown.length > visible.length && (
        <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="self-start text-[13px] font-semibold text-primary">
          {`Show more (${shown.length - visible.length} more)`}
        </button>
      )}
    </div>
  );
}
