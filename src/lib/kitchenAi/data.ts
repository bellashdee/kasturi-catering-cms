import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { RecipeRef } from "./match";
import { normName, type StockLookup } from "./calc";
import type { RecipeData } from "./types";

type DB = SupabaseClient<Database>;
const PAGE = 1000;

/** The company's recipes (name only) and whether each one has ingredient lines. */
export async function loadRecipeRefs(supabase: DB, companyId: string): Promise<RecipeRef[]> {
  const out: RecipeRef[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("recipes")
      .select("id, name, recipe_ingredients(count)")
      .eq("company_id", companyId)
      .order("name")
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    for (const r of data ?? []) out.push({ id: r.id, name: r.name, hasIngredients: (r.recipe_ingredients?.[0]?.count ?? 0) > 0 });
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}

/** Full recipes with their ingredient lines, for the dishes that are in use. */
export async function loadRecipeData(supabase: DB, ids: string[]): Promise<Map<string, RecipeData>> {
  const map = new Map<string, RecipeData>();
  const unique = Array.from(new Set(ids));
  for (let i = 0; i < unique.length; i += 100) {
    const { data, error } = await supabase
      .from("recipes")
      .select("id, name, yield_pax, recipe_ingredients(ingredient_id, quantity_per_yield, unit, ingredients(name))")
      .in("id", unique.slice(i, i + 100));
    if (error) throw error;
    for (const r of data ?? []) {
      map.set(r.id, {
        id: r.id,
        name: r.name,
        yieldPax: Number(r.yield_pax),
        lines: (r.recipe_ingredients ?? []).map((l) => ({ ingredientId: l.ingredient_id, name: l.ingredients?.name ?? "?", quantity: Number(l.quantity_per_yield), unit: l.unit })),
      });
    }
  }
  return map;
}

/** Current stock of the company's ingredients, looked up by id and by name. */
export async function loadStock(supabase: DB, companyId: string): Promise<StockLookup> {
  const byId: StockLookup["byId"] = new Map();
  const byName: StockLookup["byName"] = new Map();
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("ingredients")
      .select("id, name, current_stock_qty, unit_of_measure")
      .eq("company_id", companyId)
      .order("name")
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    for (const i of data ?? []) {
      const info = { name: i.name, qty: Number(i.current_stock_qty), unit: i.unit_of_measure };
      byId.set(i.id, info);
      byName.set(normName(i.name), info);
    }
    if ((data ?? []).length < PAGE) break;
  }
  return { byId, byName };
}
