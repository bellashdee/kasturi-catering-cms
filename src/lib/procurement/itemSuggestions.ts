import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

/** One name the Purchase Order form can offer while someone types an item. */
export type ItemSuggestion = {
  name: string;
  companyId: string;
  /** previous = already ordered before, stock = in the ingredient list, menu = an ingredient of a menu. */
  source: "previous" | "stock" | "menu";
  unit?: string | null;
  /** The unit price on the most recent order of this item. */
  lastPrice?: number;
  supplierId?: string;
  supplierName?: string;
  lastOrderDate?: string;
};

const MAX_SHOWN = 8;
const normalise = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();
const key = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();
const PAGE = 1000;

/**
 * The names offered in the Purchase Order form: items ordered before (with their last price and supplier), the ingredient
 * list of the kitchen stock, and the ingredients of the menus. Only real records, nothing invented.
 */
export async function getItemSuggestions(supabase: DB, companyIds: string[]): Promise<ItemSuggestion[]> {
  if (companyIds.length === 0) return [];
  const out: ItemSuggestion[] = [];

  // 1) previous orders (newest first, so the first time a name + supplier is seen is its latest price)
  const { data: previous } = await supabase
    .from("purchase_order_items")
    .select("item_name, unit_price, purchase_orders!inner(company_id, supplier_id, order_date, suppliers(name))")
    .in("purchase_orders.company_id", companyIds)
    .order("purchase_orders(order_date)", { ascending: false })
    .limit(3000);
  const seenPrevious = new Set<string>();
  for (const row of previous ?? []) {
    const po = row.purchase_orders;
    if (!po) continue;
    const k = `${po.company_id}|${key(row.item_name)}|${po.supplier_id}`;
    if (seenPrevious.has(k)) continue;
    seenPrevious.add(k);
    out.push({
      name: row.item_name.trim(),
      companyId: po.company_id,
      source: "previous",
      lastPrice: Number(row.unit_price),
      supplierId: po.supplier_id,
      supplierName: po.suppliers?.name,
      lastOrderDate: po.order_date,
    });
  }

  // 2) the kitchen's ingredient list
  const { data: stock } = await supabase.from("ingredients").select("name, unit_of_measure, company_id").in("company_id", companyIds).order("name").limit(3000);
  for (const i of stock ?? []) out.push({ name: i.name.trim(), companyId: i.company_id, source: "stock", unit: i.unit_of_measure });

  // 3) ingredients of the menus (distinct names)
  const seenMenu = new Set<string>();
  for (let from = 0; from < 6000; from += PAGE) {
    const { data, error } = await supabase.from("menu_plan_ingredients").select("name, unit, company_id").in("company_id", companyIds).range(from, from + PAGE - 1);
    if (error || !data) break;
    for (const m of data) {
      const k = `${m.company_id}|${key(m.name)}`;
      if (seenMenu.has(k)) continue;
      seenMenu.add(k);
      out.push({ name: m.name.trim(), companyId: m.company_id, source: "menu", unit: m.unit });
    }
    if (data.length < PAGE) break;
  }
  return out;
}

/** Picks the best suggestions for what is typed: every typed word must appear in the name; names that start with it come first. */
export function matchSuggestions(all: ItemSuggestion[], typed: string, supplierId: string): ItemSuggestion[] {
  const words = normalise(typed).split(" ").filter(Boolean);
  if (words.length === 0) return [];
  const rank = (s: ItemSuggestion) => {
    const n = normalise(s.name);
    const starts = n.startsWith(words[0]) ? 0 : n.includes(` ${words[0]}`) ? 1 : 2;
    const sourceRank = s.source === "previous" ? (s.supplierId === supplierId ? 0 : 1) : s.source === "stock" ? 2 : 3;
    return starts * 10 + sourceRank;
  };
  const hits = all.filter((s) => {
    const n = normalise(s.name);
    return words.every((w) => n.includes(w)) && n !== normalise(typed);
  });
  // one line per name: the best entry for it (an order from the chosen supplier, then any order, then stock, then menu)
  const best = new Map<string, ItemSuggestion>();
  for (const s of [...hits].sort((a, b) => rank(a) - rank(b))) if (!best.has(normalise(s.name))) best.set(normalise(s.name), s);
  return [...best.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).slice(0, MAX_SHOWN);
}

