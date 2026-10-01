"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProductionOrder, type ProductionOrderInput } from "@/lib/kitchen/actions";

type Company = { id: string; name: string };
type Recipe = { id: string; name: string; yield_pax: number; company_id: string };

type Dish = { id: string; name: string; sort_order: number };
type Meal = { id: string; meal_time: string; menu_plan_dishes: Dish[] };
type Week = { id: string; week_number: number; menu_plan_meals: Meal[] };
type Category = { id: string; code: string; name: string; menu_plan_weeks: Week[] };

const MEAL_LABEL: Record<string, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

export function ProductionOrderForm({
  companies,
  defaultCompanyId,
  recipes,
  menuPlanTrees,
}: {
  companies: Company[];
  defaultCompanyId?: string;
  recipes: Recipe[];
  menuPlanTrees: Record<string, Category[]>;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [recipeId, setRecipeId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [weekId, setWeekId] = useState("");
  const [mealId, setMealId] = useState("");
  const [dishId, setDishId] = useState("");
  const [paxCount, setPaxCount] = useState("");
  const [plannedDate, setPlannedDate] = useState("");
  const [assignedStaff, setAssignedStaff] = useState("");
  const [prepTimeMinutes, setPrepTimeMinutes] = useState("");
  const [notes, setNotes] = useState("");

  const recipesForCompany = recipes.filter((r) => r.company_id === companyId);
  const categories = menuPlanTrees[companyId] ?? [];
  const hasMenuPlan = categories.length > 0;

  const category = categories.find((c) => c.id === categoryId);
  const weeks = category?.menu_plan_weeks ?? [];
  const week = weeks.find((w) => w.id === weekId);
  const meals = week?.menu_plan_meals ?? [];
  const meal = meals.find((m) => m.id === mealId);
  const dishes = meal?.menu_plan_dishes ?? [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload: ProductionOrderInput = {
      companyId,
      recipeId: recipeId || undefined,
      menuPlanDishId: dishId || undefined,
      paxCount: paxCount ? Number(paxCount) : undefined,
      plannedDate,
      assignedStaff: assignedStaff || undefined,
      prepTimeMinutes: prepTimeMinutes ? Number(prepTimeMinutes) : undefined,
      notes: notes || undefined,
    };
    try {
      const created = await createProductionOrder(payload);
      router.push(`/kitchen/${created.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Company *</label>
          <select
            required
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value);
              setRecipeId("");
              setCategoryId("");
              setWeekId("");
              setMealId("");
              setDishId("");
            }}
            className={inputClass}
          >
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Planned Date *</label>
          <input type="date" required value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} className={inputClass} />
        </div>
      </div>

      {hasMenuPlan ? (
        <div className="rounded-lg border border-border-strong p-3">
          <div className="text-[12.5px] font-semibold text-text">Menu (from the real menu plan)</div>
          <div className="mt-2 grid grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] text-text-muted">Menu Category</label>
              <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setWeekId(""); setMealId(""); setDishId(""); }} className={inputClass}>
                <option value="">Select</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-text-muted">Week</label>
              <select value={weekId} onChange={(e) => { setWeekId(e.target.value); setMealId(""); setDishId(""); }} disabled={!categoryId} className={inputClass}>
                <option value="">Select</option>
                {weeks.map((w) => <option key={w.id} value={w.id}>Week {w.week_number}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-text-muted">Meal</label>
              <select value={mealId} onChange={(e) => { setMealId(e.target.value); setDishId(""); }} disabled={!weekId} className={inputClass}>
                <option value="">Select</option>
                {meals.map((m) => <option key={m.id} value={m.id}>{MEAL_LABEL[m.meal_time] ?? m.meal_time}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-text-muted">Dish</label>
              <select value={dishId} onChange={(e) => setDishId(e.target.value)} disabled={!mealId} className={inputClass}>
                <option value="">Select</option>
                {dishes.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          {categoryId === "" && <p className="mt-2 text-[11px] text-text-muted">Optional — leave blank to use a Recipe below instead.</p>}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Recipe{hasMenuPlan ? " (alternative to menu dish above)" : ""}</label>
          <select value={recipeId} onChange={(e) => setRecipeId(e.target.value)} className={inputClass}>
            <option value="">Not linked to a recipe yet</option>
            {recipesForCompany.map((r) => <option key={r.id} value={r.id}>{r.name} (base yield {r.yield_pax} pax)</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Pax to Produce</label>
          <input type="number" min="1" value={paxCount} onChange={(e) => setPaxCount(e.target.value)} className={inputClass} placeholder="Leave blank to use recipe's base yield" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Assigned Kitchen Staff</label>
          <input value={assignedStaff} onChange={(e) => setAssignedStaff(e.target.value)} placeholder="Type name(s), comma-separated" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Kitchen Preparation Time (minutes)</label>
          <input type="number" min="0" value={prepTimeMinutes} onChange={(e) => setPrepTimeMinutes(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1.5 h-20 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none" />
      </div>

      <p className="text-xs text-text-muted">
        Recipe + Pax will scale the ingredient list once you open this order — required ingredients are only deducted from stock when the order is marked Completed.
      </p>

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving || !plannedDate} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Create Production Order"}
        </button>
      </div>
    </form>
  );
}
