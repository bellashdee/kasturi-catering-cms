"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { canAccessModule } from "@/lib/modules";
import { calculate } from "./calc";
import { loadRecipeData, loadStock } from "./data";
import { buildEoState, type EoCalcInput } from "./eoState";
import type { CalcResult } from "./types";

/**
 * Works out the ingredients of the menu taken from an Event Order: for every dish with a recipe, (recipe quantity ÷ recipe yield) × pax.
 * Nothing is written to the database. A dish with no recipe is reported as "recipe needed", never guessed.
 */
export async function calculateEoIngredients(input: EoCalcInput): Promise<ActionResult<{ calc: CalcResult }>> {
  return runAction(async () => {
    const session = await getSessionContext();
    if (!session) throw new Error("Please sign in again.");
    if (!canAccessModule(session.allowedModules, "kitchen")) throw new Error("You do not have access to Kitchen.");
    if (!input.sessions.some((s) => s.items.length > 0)) throw new Error("There is no dish to work out. Add the menu first.");
    const supabase = await createClient();
    const ids = input.sessions.flatMap((s) => s.items.map((i) => i.recipeId)).filter((x): x is string => !!x);
    const recipes = await loadRecipeData(supabase, ids);
    const stock = input.compareStock ? await loadStock(supabase, input.companyId) : null;
    return { calc: calculate(buildEoState(input), recipes, stock) };
  });
}
