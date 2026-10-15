import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { normaliseName } from "@/lib/purchaseList/calc";

type DB = SupabaseClient<Database>;

/**
 * The latest purchase order price of each item (by company and item name): a real price from a real order, used when a stock item
 * has no unit cost of its own. Keys are `${companyId}|${normalised item name}`.
 */
export async function latestPurchasePrices(supabase: DB, companyIds: string[]): Promise<Map<string, { price: number; unit: string | null; date: string }>> {
  const { data } = await supabase
    .from("purchase_order_items")
    .select("item_name, unit, unit_price, purchase_orders!inner(company_id, order_date)")
    .in("purchase_orders.company_id", companyIds)
    .order("purchase_orders(order_date)", { ascending: false })
    .limit(5000);
  const map = new Map<string, { price: number; unit: string | null; date: string }>();
  for (const row of data ?? []) {
    const po = row.purchase_orders;
    if (!po) continue;
    const key = `${po.company_id}|${normaliseName(row.item_name)}`;
    if (!map.has(key) && Number(row.unit_price) > 0) map.set(key, { price: Number(row.unit_price), unit: row.unit, date: po.order_date });
  }
  return map;
}

export const UNCATEGORISED = "Uncategorised";

/** The category written on a stock item, tidied (trimmed, single spaces, upper case) so "ayam" and "AYAM " are one category. */
export function categoryOf(raw: string | null): string {
  const c = raw?.trim().replace(/\s+/g, " ");
  return c ? c.toUpperCase() : UNCATEGORISED;
}
