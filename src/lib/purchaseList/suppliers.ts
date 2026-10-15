import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { normaliseName } from "@/lib/purchaseList/calc";

type DB = SupabaseClient<Database>;

export type ItemSupplierInfo = {
  supplierId: string;
  supplierName: string;
  /** The unit price of the most recent purchase order line of this item from this supplier (or the stock item's own unit cost). */
  lastPrice: number | null;
};

/**
 * Who normally supplies each item, worked out only from real records, never guessed:
 *  1. the stock ingredient's preferred supplier (Kitchen -> Ingredients), else
 *  2. the supplier of the most recent purchase order line with the same item name.
 * The price is the latest purchase order price of that item from that supplier, else the stock item's unit cost.
 * Keys are normalised item names (see normaliseName).
 */
export async function suggestItemSuppliers(supabase: DB, companyId: string, names: string[]): Promise<Map<string, ItemSupplierInfo>> {
  const wanted = new Set(names.map(normaliseName));
  const result = new Map<string, ItemSupplierInfo>();
  if (wanted.size === 0) return result;

  const [{ data: ingredients }, { data: suppliers }, { data: lines }] = await Promise.all([
    supabase.from("ingredients").select("name, unit_cost, preferred_supplier_id").eq("company_id", companyId),
    supabase.from("suppliers").select("id, name").eq("company_id", companyId),
    supabase
      .from("purchase_order_items")
      .select("item_name, unit_price, purchase_orders!inner(company_id, supplier_id, order_date)")
      .eq("purchase_orders.company_id", companyId)
      .order("purchase_orders(order_date)", { ascending: false })
      .limit(3000),
  ]);
  const supplierName = new Map((suppliers ?? []).map((s) => [s.id, s.name]));

  // latest price per (item, supplier) and latest supplier per item, from the order history (newest first)
  const lastPrice = new Map<string, number>();
  const lastSupplier = new Map<string, string>();
  for (const l of lines ?? []) {
    const key = normaliseName(l.item_name);
    const sid = l.purchase_orders?.supplier_id;
    if (!wanted.has(key) || !sid) continue;
    if (!lastPrice.has(`${key}|${sid}`)) lastPrice.set(`${key}|${sid}`, Number(l.unit_price));
    if (!lastSupplier.has(key)) lastSupplier.set(key, sid);
  }

  const stock = new Map((ingredients ?? []).map((i) => [normaliseName(i.name), i]));
  for (const key of wanted) {
    const item = stock.get(key);
    const sid = (item?.preferred_supplier_id && supplierName.has(item.preferred_supplier_id) ? item.preferred_supplier_id : null) ?? lastSupplier.get(key) ?? null;
    if (!sid || !supplierName.has(sid)) continue;
    const price = lastPrice.get(`${key}|${sid}`) ?? (item && Number(item.unit_cost) > 0 ? Number(item.unit_cost) : null);
    result.set(key, { supplierId: sid, supplierName: supplierName.get(sid) as string, lastPrice: price });
  }
  return result;
}

/** Supplier records of a company by normalised (lower-case, single-spaced) name, to match the supplier typed on a list line. */
export function supplierKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}
