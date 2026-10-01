import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

export async function listMenuCategories(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("menu_plan_categories")
    .select("id, code, name, company_id")
    .in("company_id", companyIds)
    .order("code");
  if (error) throw error;
  return data;
}

/**
 * The full Category -> Week -> Meal -> Dish tree for a company (no
 * ingredients — just enough for a cascading select), used by the Kitchen
 * Production Schedule form to link a production order to a real menu dish.
 */
export async function getMenuPlanTree(supabase: DB, companyId: string) {
  const { data, error } = await supabase
    .from("menu_plan_categories")
    .select("id, code, name, menu_plan_weeks(id, week_number, menu_plan_meals(id, meal_time, menu_plan_dishes(id, name, sort_order)))")
    .eq("company_id", companyId)
    .order("code");
  if (error) throw error;
  return data;
}

export async function getMenuPlanDishWithIngredients(supabase: DB, dishId: string) {
  const { data, error } = await supabase
    .from("menu_plan_dishes")
    .select("id, name, menu_plan_ingredients(id, name, base_quantity, base_pax, unit)")
    .eq("id", dishId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * One week's full Breakfast/Lunch/Dinner -> Dish -> Ingredient tree for a
 * category, in one nested query (weeks -> meals -> dishes -> ingredients
 * are all direct FK relationships, so PostgREST embeds the whole thing).
 */
export async function getWeekPlan(supabase: DB, categoryId: string, weekNumber: number) {
  const { data, error } = await supabase
    .from("menu_plan_weeks")
    .select(
      "id, week_number, menu_plan_meals(id, meal_time, menu_plan_dishes(id, name, sort_order, menu_plan_ingredients(id, name, base_quantity, base_pax, unit, reference_quantity, reference_pax, remark, sort_order)))",
    )
    .eq("category_id", categoryId)
    .eq("week_number", weekNumber)
    .maybeSingle();
  if (error) throw error;
  return data;
}
