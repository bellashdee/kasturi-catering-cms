import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listMenuCategories, getWeekPlan } from "@/lib/menuPlan/queries";
import { calculateQuantity, formatQuantity, mealRank, mealTitle, MEAL_ORDER, MEAL_LABEL } from "@/lib/menuPlan/calc";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";

export default async function IngredientCalculatorPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; category?: string; week?: string; meal?: string; pax?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];

  const { company: requestedId, category: categoryParam, week: weekParam, meal: mealParam, pax: paxParam } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const categories = await listMenuCategories(supabase, targetCompanyIds);
  const categoryId = categoryParam && categories.some((c) => c.id === categoryParam) ? categoryParam : categories[0]?.id;
  const weekNumber = Math.min(14, Math.max(1, Number(weekParam) || 1));
  const pax = Math.max(1, Number(paxParam) || 100);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Ingredient Calculator</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          Menu Type → Week → Meal → Menu → Ingredients, scaled to the pax you need.
        </p>
      </div>

      {categories.length === 0 ? (
        <EmptyRow text="No menu categories for this company yet." />
      ) : (
        <>
          <form method="get" className="flex flex-wrap items-end gap-3">
            {requestedId && <input type="hidden" name="company" value={requestedId} />}
            <div>
              <label className="text-[12px] font-semibold text-text-secondary">Menu Category</label>
              <select name="category" defaultValue={categoryId} className="mt-1 h-9 w-40 rounded-lg border border-border-strong px-2 text-[13px]">
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-semibold text-text-secondary">Week</label>
              <select name="week" defaultValue={weekNumber} className="mt-1 h-9 w-32 rounded-lg border border-border-strong px-2 text-[13px]">
                {Array.from({ length: 14 }, (_, i) => i + 1).map((w) => <option key={w} value={w}>Week {w}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-semibold text-text-secondary">Meal</label>
              <select name="meal" defaultValue={mealParam ?? ""} className="mt-1 h-9 w-36 rounded-lg border border-border-strong px-2 text-[13px]">
                <option value="">All Meals</option>
                {MEAL_ORDER.map((m) => <option key={m} value={m}>{MEAL_LABEL[m]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-semibold text-text-secondary">Required Pax</label>
              <input type="number" name="pax" min={1} defaultValue={pax} className="mt-1 h-9 w-28 rounded-lg border border-border-strong px-2 text-[13px]" />
            </div>
            <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">Calculate</button>
          </form>

          <CategoryWeekView
            supabase={supabase}
            categoryId={categoryId!}
            weekNumber={weekNumber}
            mealFilter={mealParam || undefined}
            pax={pax}
            query={query}
          />

          <div className="rounded-xl border border-border bg-surface p-4 text-[13px] text-text-secondary">
            Review these quantities, then create the actual purchase request yourself in{" "}
            <Link href={`/kitchen/purchase-requests${query}`} className="font-semibold text-primary hover:underline">
              Kitchen → Purchase Requests
            </Link>{" "}
            — nothing here creates a purchase order or payment automatically.
          </div>
        </>
      )}
    </div>
  );
}

async function CategoryWeekView({
  supabase,
  categoryId,
  weekNumber,
  mealFilter,
  pax,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  categoryId: string;
  weekNumber: number;
  mealFilter?: string;
  pax: number;
  query: string;
}) {
  const week = await getWeekPlan(supabase, categoryId, weekNumber);

  if (!week || week.menu_plan_meals.length === 0) {
    return <EmptyRow text={`No menu data for Week ${weekNumber} yet.`} />;
  }

  const meals = [...week.menu_plan_meals]
    .filter((m) => !mealFilter || m.meal_time === mealFilter)
    .sort((a, b) => mealRank(a) - mealRank(b));

  return (
    <div className="flex flex-col gap-4">
      {meals.map((meal) => (
        <SectionCard key={meal.id} title={mealTitle(meal)}>
          <div className="flex flex-col gap-4">
            {[...meal.menu_plan_dishes]
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((dish) => (
                <div key={dish.id}>
                  <div className="mb-1.5 text-[13.5px] font-bold text-text">{dish.name}</div>
                  <div className="overflow-hidden rounded-lg border border-border">
                    <table className="w-full border-collapse text-left">
                      <thead className="bg-surface-alt">
                        <tr className="text-[10.5px] font-bold uppercase tracking-wide text-text-muted">
                          <th className="px-3 py-2">Ingredient</th>
                          <th className="px-3 py-2">Base Quantity</th>
                          <th className="px-3 py-2">Base Pax</th>
                          <th className="px-3 py-2">Required Pax</th>
                          <th className="px-3 py-2">Calculated Quantity</th>
                          <th className="px-3 py-2">Unit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...dish.menu_plan_ingredients]
                          .sort((a, b) => a.sort_order - b.sort_order)
                          .map((ing) => {
                            const calculated = calculateQuantity(
                              ing.base_quantity === null ? null : Number(ing.base_quantity),
                              ing.base_pax,
                              pax,
                            );
                            return (
                              <tr key={ing.id} className="border-t border-border text-[12.5px]">
                                <td className="px-3 py-2 text-text">
                                  {ing.name}
                                  {ing.remark && <div className="text-[10.5px] text-text-muted">{ing.remark}</div>}
                                </td>
                                <td className="px-3 py-2 text-text-secondary">{ing.base_quantity === null ? "—" : formatQuantity(Number(ing.base_quantity))}</td>
                                <td className="px-3 py-2 text-text-secondary">{ing.base_pax}</td>
                                <td className="px-3 py-2 text-text-secondary">{pax}</td>
                                <td className="px-3 py-2 font-semibold text-text">{formatQuantity(calculated)}</td>
                                <td className="px-3 py-2 text-text-secondary">{ing.unit ?? "—"}</td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
          </div>
        </SectionCard>
      ))}
    </div>
  );
}
