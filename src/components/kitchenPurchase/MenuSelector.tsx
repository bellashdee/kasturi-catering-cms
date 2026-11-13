"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRequestFromMenus } from "@/lib/kitchenPurchase/actions";

type Dish = { menu: string; recipeId: string | null; boughtIn?: boolean };
type Recipe = { id: string; name: string };

const input = "h-11 w-full rounded-lg border border-border-strong bg-white px-3 text-[14px] outline-none focus:border-primary";

/**
 * Event menu selection: every dish of the event is matched to an approved recipe (change the recipe, or tick the dish off). Pressing
 * the button lists the ingredients of the chosen recipes as one purchase list with the quantities left empty.
 */
export function MenuSelector({ eventId, dayId, dishes, recipes }: { eventId: string; dayId: string | null; dishes: Dish[]; recipes: Recipe[] }) {
  const router = useRouter();
  // fruit, kuih and the like are bought ready-made: listed apart, never matched to a recipe
  const boughtIn = dishes.filter((d) => d.boughtIn).map((d) => d.menu);
  const [rows, setRows] = useState(() => dishes.filter((d) => !d.boughtIn).map((d) => ({ ...d, on: !!d.recipeId })));
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = rows.filter((r) => r.on && r.recipeId);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const r = await createRequestFromMenus({ eventId, dayId, selections: chosen.map((x) => ({ menu: x.menu, recipeId: x.recipeId })) });
      if (!r.ok) setError(r.error);
      else router.push(`/kitchen/purchase-requests/${r.id}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-[18px] font-extrabold text-text">Which menus need ingredients?</h2>
        <p className="mt-0.5 text-[13.5px] text-text-secondary">Each dish is matched to an approved company recipe. Check the recipe, or untick a dish that needs nothing. Only approved recipes are used.</p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {rows.map((r, i) => (
          <li key={`${r.menu}-${i}`} className="rounded-xl border border-border bg-surface p-3.5">
            <label className="flex items-start gap-3">
              <input type="checkbox" checked={r.on} disabled={!r.recipeId} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, on: e.target.checked } : y)))} className="mt-1 h-5 w-5 accent-[#a85d6b]" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15.5px] font-bold text-text">{r.menu}</span>
                <select
                  value={r.recipeId ?? ""}
                  onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, recipeId: e.target.value || null, on: !!e.target.value } : y)))}
                  className={`${input} mt-1.5`}
                  aria-label={`Recipe for ${r.menu}`}
                >
                  <option value="">No approved recipe chosen</option>
                  {recipes.map((rec) => (
                    <option key={rec.id} value={rec.id}>
                      {rec.name}
                    </option>
                  ))}
                </select>
                {!r.recipeId && <span className="mt-1 block text-[12.5px] text-warning">No approved recipe found for this dish. Choose one, or add the recipe in Recipes first.</span>}
              </span>
            </label>
          </li>
        ))}
        {rows.length === 0 && <li className="rounded-xl bg-surface-alt px-4 py-3 text-[14px] text-text-secondary">This event has no menu to cook. Add a menu below.</li>}
      </ul>

      {boughtIn.length > 0 && (
        <div className="rounded-xl border border-border bg-surface-alt px-4 py-3 text-[13.5px] text-text-secondary">
          <b className="text-text">Bought ready (outsourced), no recipe or ingredients needed:</b> {boughtIn.join(", ")}
        </div>
      )}

      <div className="flex gap-2">
        <select value={extra} onChange={(e) => setExtra(e.target.value)} className={input} aria-label="Add a menu from the recipe database">
          <option value="">Add another menu from the Recipe Database...</option>
          {recipes.map((rec) => (
            <option key={rec.id} value={rec.id}>
              {rec.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!extra}
          onClick={() => {
            const rec = recipes.find((x) => x.id === extra);
            if (rec) setRows((x) => [...x, { menu: rec.name, recipeId: rec.id, on: true }]);
            setExtra("");
          }}
          className="h-11 shrink-0 rounded-lg border border-border-strong bg-white px-4 text-[14px] font-bold disabled:opacity-60"
        >
          + Add
        </button>
      </div>

      <button type="button" disabled={busy || chosen.length === 0} onClick={generate} className="h-14 w-full rounded-xl bg-primary text-[16px] font-extrabold text-white hover:bg-primary-hover disabled:opacity-60">
        {busy ? "Making the ingredient list..." : `Generate ingredient list (${chosen.length} menu${chosen.length === 1 ? "" : "s"})`}
      </button>
      <p className="text-center text-[12.5px] text-text-muted">The list has ingredients and units only. You write the quantity of each item yourself.</p>
      {error && (
        <div role="alert" className="rounded-lg bg-danger-bg px-4 py-3 text-[14px] text-danger">
          {error}
        </div>
      )}
    </div>
  );
}
