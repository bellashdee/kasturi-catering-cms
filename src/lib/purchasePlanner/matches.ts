import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { optionKey } from "./shared";

type DB = SupabaseClient<Database>;

export type SavedMatchRow = { ingredientKey: string; ingredientName: string; supplierId: string; description: string; uom: string };

/** The matches people saved for the company: ingredient (as kept) -> the key of the supplier item. */
export async function loadSavedMatchRows(supabase: DB, companyId: string): Promise<SavedMatchRow[]> {
  const { data } = await supabase.from("ingredient_supplier_matches").select("ingredient_key, ingredient_name, supplier_id, item_description, uom").eq("company_id", companyId).limit(5000);
  return (data ?? []).map((r) => ({ ingredientKey: r.ingredient_key, ingredientName: r.ingredient_name, supplierId: r.supplier_id, description: r.item_description, uom: r.uom }));
}

export async function loadSavedMatches(supabase: DB, companyId: string): Promise<Map<string, string>> {
  const rows = await loadSavedMatchRows(supabase, companyId);
  return new Map(rows.map((r) => [r.ingredientKey, optionKey(r.supplierId, r.description, r.uom)]));
}
