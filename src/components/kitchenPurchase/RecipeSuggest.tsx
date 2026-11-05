"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveReferenceRecipe, suggestRecipe, type SuggestedRecipe } from "@/lib/kitchenPurchase/recipeActions";
import { UNITS } from "@/lib/kitchenPurchase/shared";

const input = "h-11 w-full rounded-lg border border-border-strong bg-white px-3 text-[14px] outline-none focus:border-primary";
type Line = { key: string; name: string; unit: string; quantity: string };

/**
 * Menu name -> a reference recipe from Google -> the chef edits it (add, change or delete any ingredient and step) -> the chef approves it
 * as a company recipe, or keeps it as a draft. Nothing from Google is saved or approved by itself.
 */
export function RecipeSuggest({ companies }: { companies: { id: string; name: string }[] }) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [menu, setMenu] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<SuggestedRecipe | null>(null);
  const [name, setName] = useState("");
  const [yieldPax, setYieldPax] = useState("10");
  const [lines, setLines] = useState<Line[]>([]);
  const [steps, setSteps] = useState("");
  const [reviewed, setReviewed] = useState(false);

  async function find() {
    setBusy("find");
    setError(null);
    try {
      const r = await suggestRecipe(menu);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setFound(r.recipe);
      setName(r.recipe.title);
      setYieldPax(String(r.recipe.servings));
      setLines(r.recipe.ingredients.map((i, n) => ({ key: `i${n}`, name: i.name, unit: i.unit, quantity: "" })));
      setSteps(r.recipe.steps.map((s, n) => `${n + 1}. ${s}`).join("\n"));
      setReviewed(false);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function save(approve: boolean) {
    setBusy(approve ? "approve" : "draft");
    setError(null);
    try {
      const sourceNote = found
        ? found.basis === "google"
          ? `Reference from Google: ${found.sources.map((s) => s.url).join(" ; ")}. Reviewed and edited by the chef.`
          : "Reference suggested by AI (no Google link). Reviewed and edited by the chef."
        : "";
      const r = await saveReferenceRecipe({
        companyId,
        name,
        yieldPax: Number(yieldPax),
        instructions: steps,
        sourceNote,
        lines: lines.map((l) => ({ name: l.name, unit: l.unit, quantity: l.quantity.trim() === "" ? null : Number(l.quantity) })),
        approve,
      });
      if (!r.ok) setError(r.error);
      else {
        router.push(`/kitchen/recipes/${r.id}`);
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_16rem_auto]">
          <input value={menu} onChange={(e) => setMenu(e.target.value)} placeholder="Menu name (for example Chicken Chop)" className={input} aria-label="Menu name" />
          {companies.length > 1 ? (
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={input} aria-label="Company">
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex h-11 items-center text-[14px] font-semibold text-text-secondary">{companies[0]?.name}</div>
          )}
          <button type="button" disabled={busy !== null || !menu.trim()} onClick={find} className="h-11 rounded-lg bg-primary px-5 text-[14px] font-bold text-white disabled:opacity-60">
            {busy === "find" ? "Searching..." : "Find recipe"}
          </button>
        </div>
        <p className="mt-2 text-[12.5px] text-text-muted">The recipe found on Google is a reference only. You review it, change it to how our kitchen cooks, and approve it. Nothing is saved until you press a save button below.</p>
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-danger-bg px-4 py-3 text-[14px] text-danger">
          {error}
        </div>
      )}

      {found && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-warning/40 bg-warning-bg px-4 py-3 text-[13.5px] text-warning">
            <b>Reference only. Not approved.</b> {found.basis === "google" ? "Found from Google sources:" : "Suggested by the AI, without a Google link."}
            {found.basis === "google" && (
              <ul className="mt-1 list-disc pl-5">
                {found.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                      {s.title || s.url}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
            <label className="text-[12px] font-semibold text-text-secondary">
              Recipe name (company recipe)
              <input value={name} onChange={(e) => setName(e.target.value)} className={`${input} mt-1`} />
            </label>
            <label className="text-[12px] font-semibold text-text-secondary">
              Base yield (pax)
              <input inputMode="numeric" value={yieldPax} onChange={(e) => setYieldPax(e.target.value.replace(/\D/g, ""))} className={`${input} mt-1`} />
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-[14px] font-bold text-text">Ingredients: remove what our kitchen does not use, add our own</div>
            {lines.map((l, i) => (
              <div key={l.key} className="grid grid-cols-[1fr_7rem] gap-2 sm:grid-cols-[1fr_7rem_8rem_auto]">
                <input value={l.name} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} className={`${input} col-span-2 sm:col-span-1`} aria-label="Ingredient" />
                <select value={l.unit} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, unit: e.target.value } : y)))} className={input} aria-label="Unit">
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <input inputMode="decimal" value={l.quantity} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, quantity: e.target.value.replace(/[^\d.]/g, "") } : y)))} placeholder="Qty (optional)" className={input} aria-label="Quantity for the base yield (optional)" />
                <button type="button" onClick={() => setLines((x) => x.filter((_, j) => j !== i))} className="h-11 rounded-lg border border-danger px-3 text-[13px] font-bold text-danger hover:bg-danger-bg">
                  Delete
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setLines((x) => [...x, { key: `n${Date.now()}${x.length}`, name: "", unit: "KG", quantity: "" }])} className="h-11 rounded-lg border border-border-strong bg-white px-4 text-[14px] font-bold">
              + Add ingredient
            </button>
          </div>

          <label className="text-[12px] font-semibold text-text-secondary">
            Preparation steps (our own)
            <textarea value={steps} onChange={(e) => setSteps(e.target.value)} rows={7} className="mt-1 w-full rounded-lg border border-border-strong bg-white px-3 py-2 text-[14px] outline-none focus:border-primary" />
          </label>

          <label className="flex items-start gap-2.5 rounded-lg bg-surface-alt px-4 py-3 text-[14px] text-text">
            <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#a85d6b]" />
            I am a chef and I have reviewed this recipe. It matches how our kitchen cooks it.
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy !== null || !reviewed} onClick={() => save(true)} className="h-12 rounded-lg bg-primary px-5 text-[14px] font-bold text-white disabled:opacity-60">
              {busy === "approve" ? "Saving..." : "Approve and save as company recipe"}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => save(false)} className="h-12 rounded-lg border border-border-strong bg-white px-5 text-[14px] font-bold text-text disabled:opacity-60">
              {busy === "draft" ? "Saving..." : "Save as draft (not approved)"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
