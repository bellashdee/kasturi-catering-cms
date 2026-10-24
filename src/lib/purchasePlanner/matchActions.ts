"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { ingredientKey } from "./shared";

export type MatchInput = { ingredient: string; supplierId: string; description: string; uom: string };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

async function save(companyId: string, list: MatchInput[]) {
  const { supabase, userId } = await requireUser();
  const clean = list
    .map((m) => ({ ...m, key: ingredientKey(m.ingredient) }))
    .filter((m) => m.key && m.supplierId && m.description.trim());
  if (clean.length === 0) return 0;
  const ids = Array.from(new Set(clean.map((m) => m.supplierId)));
  const { data: suppliers } = await supabase.from("suppliers").select("id").eq("company_id", companyId).in("id", ids);
  const ok = new Set((suppliers ?? []).map((s) => s.id));
  const rows = clean
    .filter((m) => ok.has(m.supplierId))
    .map((m) => ({ company_id: companyId, ingredient_key: m.key, ingredient_name: m.ingredient.trim().slice(0, 200), supplier_id: m.supplierId, item_description: m.description.trim().slice(0, 300), uom: m.uom ?? "", created_by: userId, updated_at: new Date().toISOString() }));
  if (rows.length === 0) throw new Error("A supplier was not found for this company.");
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from("ingredient_supplier_matches").upsert(rows.slice(i, i + 200), { onConflict: "company_id,ingredient_key" });
    if (error) throw error;
  }
  revalidatePath("/supplier-procurement/ingredient-matching");
  return rows.length;
}

/** Remembers which supplier item an ingredient is bought as (the next purchase list starts from it). */
export async function saveIngredientMatch(companyId: string, match: MatchInput): Promise<ActionResult<{ saved: number }>> {
  return runAction(async () => ({ saved: await save(companyId, [match]) }), "Could not save the match. Please try again.");
}

/** Saves many matches at once (the suggested ones that were checked). */
export async function saveIngredientMatches(companyId: string, matches: MatchInput[]): Promise<ActionResult<{ saved: number }>> {
  return runAction(async () => {
    if (matches.length > 1000) throw new Error("Save 1000 matches or fewer at a time.");
    return { saved: await save(companyId, matches) };
  }, "Could not save the matches. Please try again.");
}

/** Forgets the saved match of an ingredient (the system goes back to suggesting by name). */
export async function clearIngredientMatch(companyId: string, ingredient: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { error } = await supabase.from("ingredient_supplier_matches").delete().eq("company_id", companyId).eq("ingredient_key", ingredientKey(ingredient));
    if (error) throw error;
    revalidatePath("/supplier-procurement/ingredient-matching");
    return {};
  }, "Could not remove the match. Please try again.");
}
