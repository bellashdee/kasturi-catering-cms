"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { generateCookingPlan } from "@/lib/kitchenPlan/actions";
import { kitchenPlanText } from "@/lib/kitchenPlan/text";

const field = "h-12 w-full rounded-lg border border-border-strong bg-white px-3 text-[15px] outline-none focus:border-primary";

/** Steps 2 and 3: the dishes (filled from the Event Order) and one big button that makes the plan. */
export function PlanBuilder({
  eventId,
  dayId,
  initialDishes,
  recipeNames,
  readyTime,
}: {
  eventId: string;
  dayId: string | null;
  initialDishes: string[];
  recipeNames: string[];
  readyTime: string | null;
}) {
  const router = useRouter();
  const { lang } = useI18n();
  const t = kitchenPlanText(lang === "ms" ? "ms" : "en");
  const [dishes, setDishes] = useState<string[]>(initialDishes);
  const [draft, setDraft] = useState("");
  const [cooks, setCooks] = useState(2);
  const [ready, setReady] = useState(readyTime ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function add() {
    const name = draft.replace(/\s+/g, " ").trim();
    if (!name) return;
    if (!dishes.some((d) => d.toUpperCase() === name.toUpperCase())) setDishes((d) => [...d, name]);
    setDraft("");
  }

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const r = await generateCookingPlan({ eventId, dayId, dishes, cooks, readyTime: readyTime ? undefined : ready });
      if (!r.ok) setError(r.error);
      else router.refresh();
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[18px] font-extrabold text-text">{t.menuTitle}</h2>
          <p className="mt-0.5 text-[13.5px] text-text-secondary">{t.menuHint}</p>
        </div>
        {dishes.length === 0 ? (
          <p className="rounded-lg bg-surface-alt px-4 py-3 text-[14px] text-text-secondary">{t.noDishes}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {dishes.map((d, i) => (
              <li key={d} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3">
                <span className="text-[15.5px] font-semibold text-text">
                  <span className="mr-2 text-text-muted">{i + 1}.</span>
                  {d}
                </span>
                <button type="button" onClick={() => setDishes((x) => x.filter((y) => y !== d))} aria-label={`${t.remove} ${d}`} className="h-9 rounded-md px-3 text-[13px] font-semibold text-danger hover:bg-danger-bg">
                  {t.remove}
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="flex gap-2"
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} list="plan-recipe-names" placeholder={t.dishPlaceholder} className={field} />
          <datalist id="plan-recipe-names">
            {recipeNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <button type="submit" className="h-12 shrink-0 rounded-lg border border-border-strong bg-white px-4 text-[14px] font-bold text-text hover:border-primary hover:text-primary">
            + {t.addDish}
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-[14px] font-bold text-text" htmlFor="plan-cooks">
              {t.cooks}
            </label>
            <p className="mb-1.5 text-[12.5px] text-text-muted">{t.cooksHint}</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setCooks((c) => Math.max(1, c - 1))} aria-label="-" className="h-12 w-12 rounded-lg border border-border-strong bg-white text-[20px] font-bold">
                −
              </button>
              <input id="plan-cooks" type="number" min={1} max={20} value={cooks} onChange={(e) => setCooks(Number(e.target.value) || 1)} className={`${field} w-20 text-center`} />
              <button type="button" onClick={() => setCooks((c) => Math.min(20, c + 1))} aria-label="+" className="h-12 w-12 rounded-lg border border-border-strong bg-white text-[20px] font-bold">
                +
              </button>
            </div>
          </div>
          {!readyTime && (
            <div>
              <label className="text-[14px] font-bold text-text" htmlFor="plan-ready">
                {t.readyAt}
              </label>
              <input id="plan-ready" type="time" value={ready} onChange={(e) => setReady(e.target.value)} className={`${field} mt-[26px] sm:max-w-[10rem]`} />
            </div>
          )}
        </div>

        <button type="button" onClick={generate} disabled={busy || dishes.length === 0} className="h-14 w-full rounded-xl bg-primary text-[16px] font-extrabold text-white shadow-sm hover:bg-primary-hover disabled:opacity-60">
          {busy ? t.generating : t.generate}
        </button>
        {error && (
          <div role="alert" className="rounded-lg bg-danger-bg px-4 py-3 text-[14px] text-danger">
            {error}
          </div>
        )}
      </section>
    </div>
  );
}
