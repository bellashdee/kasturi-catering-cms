import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { MEAL_LABEL, mealRank, mealTitle } from "@/lib/menuPlan/calc";
import { normaliseName, type SelectedMenu, type SourceLine, type StockMap } from "@/lib/purchaseList/calc";

type DB = SupabaseClient<Database>;

/** One pickable menu: a dish of the menu plan (Signature Solution) or a recipe (Kasturi Indah), with its real ingredient lines. */
export type CatalogMenu = {
  key: string;
  sourceType: "menu_plan" | "recipe";
  sourceId: string;
  companyId: string;
  /** What the menu is called, e.g. "AYAM MASAK MERAH". */
  name: string;
  /** Where it sits, e.g. "UTM › Week 3 › Lunch" or "Recipes". */
  group: string;
  category: string;
  week: number | null;
  meal: string | null;
  lines: SourceLine[];
};

export const menuKey = (sourceType: string, sourceId: string) => `${sourceType}:${sourceId}`;

type PlanRow = {
  id: string;
  name: string;
  sort_order: number;
  menu_plan_ingredients: { name: string; base_quantity: number | null; base_pax: number; unit: string | null; reference_quantity: number | null; reference_pax: number | null; remark: string | null; sort_order: number }[];
};

function planLines(d: PlanRow): SourceLine[] {
  return [...d.menu_plan_ingredients]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => ({
      name: i.name,
      baseQuantity: i.base_quantity === null ? null : Number(i.base_quantity),
      basePax: i.base_pax,
      unit: i.unit,
      referenceQuantity: i.reference_quantity === null ? null : Number(i.reference_quantity),
      referencePax: i.reference_pax,
      remark: i.remark,
    }));
}

/** Every pickable menu for the given companies, read from the real menu-plan and recipe tables (nothing is copied or invented). */
export async function getMenuCatalog(supabase: DB, companyIds: string[]): Promise<CatalogMenu[]> {
  const catalog: CatalogMenu[] = [];

  const { data: categories, error: catError } = await supabase.from("menu_plan_categories").select("id, name, company_id").in("company_id", companyIds).order("code");
  if (catError) throw catError;
  for (const cat of categories ?? []) {
    const { data: weeks, error } = await supabase
      .from("menu_plan_weeks")
      .select(
        "week_number, menu_plan_meals(meal_time, day_of_week, menu_plan_dishes(id, name, sort_order, menu_plan_ingredients(name, base_quantity, base_pax, unit, reference_quantity, reference_pax, remark, sort_order)))",
      )
      .eq("category_id", cat.id)
      .order("week_number");
    if (error) throw error;
    for (const week of weeks ?? []) {
      const meals = [...week.menu_plan_meals].sort((a, b) => mealRank(a) - mealRank(b));
      for (const meal of meals) {
        for (const dish of [...meal.menu_plan_dishes].sort((a, b) => a.sort_order - b.sort_order)) {
          catalog.push({
            key: menuKey("menu_plan", dish.id),
            sourceType: "menu_plan",
            sourceId: dish.id,
            companyId: cat.company_id,
            name: dish.name,
            group: `${cat.name} › Week ${week.week_number} › ${mealTitle(meal)}`,
            category: cat.name,
            week: week.week_number,
            // a daily menu is identified by its weekday (monday ...), a normal meal by breakfast / lunch / dinner
            meal: meal.meal_time === "daily" ? (meal.day_of_week ?? "daily") : meal.meal_time,
            lines: planLines(dish as PlanRow),
          });
        }
      }
    }
  }

  const { data: recipes, error: recipeError } = await supabase
    .from("recipes")
    .select("id, name, company_id, yield_pax, recipe_ingredients(quantity_per_yield, unit, ingredients(name))")
    .in("company_id", companyIds)
    .order("name");
  if (recipeError) throw recipeError;
  for (const r of recipes ?? []) {
    catalog.push({
      key: menuKey("recipe", r.id),
      sourceType: "recipe",
      sourceId: r.id,
      companyId: r.company_id,
      name: r.name,
      group: "Recipes",
      category: "Recipes",
      week: null,
      meal: null,
      lines: r.recipe_ingredients
        .filter((ri) => ri.ingredients?.name)
        .map((ri) => ({
          name: ri.ingredients!.name,
          baseQuantity: ri.quantity_per_yield === null ? null : Number(ri.quantity_per_yield),
          basePax: Number(r.yield_pax),
          unit: ri.unit,
        })),
    });
  }
  return catalog;
}

/** The selected menus, re-read from the database (the server never trusts quantities sent by the browser). */
export async function loadSelectedMenus(
  supabase: DB,
  companyId: string,
  selections: { sourceType: "menu_plan" | "recipe"; sourceId: string }[],
): Promise<(SelectedMenu & { sourceType: "menu_plan" | "recipe"; sourceId: string; groupLabel: string })[]> {
  const catalog = (await getMenuCatalog(supabase, [companyId])).filter((m) => m.companyId === companyId);
  const byKey = new Map(catalog.map((m) => [m.key, m]));
  return selections.map((s) => {
    const menu = byKey.get(menuKey(s.sourceType, s.sourceId));
    if (!menu) throw new Error("One of the selected menus no longer exists for this company.");
    return { key: menu.key, label: menu.name, group: menu.group, groupLabel: menu.group, lines: menu.lines, sourceType: s.sourceType, sourceId: s.sourceId };
  });
}

/**
 * Stock-on-hand by ingredient name. An ingredient only counts as "checked" when its stock has really been recorded
 * (it has at least one stock movement); a bare 0 that nobody counted is not treated as "no stock".
 */
export async function getStockMap(supabase: DB, companyId: string): Promise<StockMap> {
  const [{ data: ingredients }, { data: movements }] = await Promise.all([
    supabase.from("ingredients").select("id, name, unit_of_measure, current_stock_qty").eq("company_id", companyId),
    supabase.from("stock_movements").select("ingredient_id").eq("company_id", companyId).limit(5000),
  ]);
  const recorded = new Set((movements ?? []).map((m) => m.ingredient_id));
  const map: StockMap = new Map();
  for (const i of ingredients ?? []) {
    if (recorded.has(i.id)) map.set(normaliseName(i.name), { quantity: Number(i.current_stock_qty), unit: i.unit_of_measure });
  }
  return map;
}

export async function listPurchaseLists(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("purchase_lists")
    .select("*, companies(name), purchase_list_menus(menu_label, group_label), purchase_list_items(status)")
    .in("company_id", companyIds)
    .order("event_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getPurchaseList(supabase: DB, id: string) {
  const { data, error } = await supabase
    .from("purchase_lists")
    .select("*, companies(name), purchase_list_menus(*), purchase_list_items(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export const MEAL_SESSION_LABEL: Record<string, string> = { ...MEAL_LABEL, hi_tea: "Hi-Tea", other: "Other" };
