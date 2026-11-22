import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { RESTAURANT_COMPANY_NAME } from "@/lib/restaurantView";
import type { WastageRow } from "@/lib/kitchen/wastage";

type DB = SupabaseClient<Database>;

/** O2 Life (the restaurant) among the companies being viewed: the Wastage Log is made for it (the catering companies keep the stock wastage). */
export function restaurantOf(companies: { id: string; name: string }[], targetCompanyIds: string[]) {
  const o2 = companies.find((c) => c.name === RESTAURANT_COMPANY_NAME);
  return o2 && targetCompanyIds.includes(o2.id) ? o2 : null;
}

/** The entries of the companies in a month (YYYY-MM, or all months), newest first. */
export async function listWastage(supabase: DB, companyIds: string[], range: { start: string; end: string } | null): Promise<WastageRow[]> {
  let query = supabase.from("wastage_log").select("*").in("company_id", companyIds).order("wasted_on", { ascending: false }).order("created_at", { ascending: false }).limit(2000);
  if (range) query = query.gte("wasted_on", range.start).lte("wasted_on", range.end);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** Items typed before, the most recent first, for the Item box of the form. */
export async function pastWastageItems(supabase: DB, companyIds: string[]): Promise<string[]> {
  const { data } = await supabase.from("wastage_log").select("item").in("company_id", companyIds).order("created_at", { ascending: false }).limit(500);
  const seen = new Map<string, string>();
  for (const r of data ?? []) {
    const key = r.item.trim().toUpperCase();
    if (key && !seen.has(key)) seen.set(key, r.item.trim());
  }
  return [...seen.values()];
}
