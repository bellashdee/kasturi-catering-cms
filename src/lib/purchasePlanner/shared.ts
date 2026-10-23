import { similarity } from "@/lib/kitchenAi/match";
import { toBase, type Base } from "@/lib/kitchenAi/units";

/** One item a supplier sells, with the price on the latest invoice line (taken from the purchase listings, never invented). */
export type SupplierItemOption = {
  key: string;
  supplierId: string;
  supplierName: string;
  description: string;
  uom: string;
  /** the latest unit price exactly as on the invoice line */
  price: number;
  date: string;
};

export const optionKey = (supplierId: string, description: string, uom: string) => `${supplierId}|${description.toUpperCase().replace(/[^A-Z0-9]/g, "")}|${uom.toUpperCase()}`;

const MIN_MATCH = 0.5;

/**
 * The supplier items that look like an ingredient, best first (the same words, in any order; a name inside a longer one counts).
 * Among equally good ones, the most recent purchase comes first. A suggestion only: the person can choose any other item.
 */
export function rankSupplierItems(ingredient: string, items: SupplierItemOption[], limit = 8): { option: SupplierItemOption; score: number }[] {
  return items
    .map((option) => ({ option, score: similarity(ingredient, option.description) }))
    .filter((x) => x.score >= MIN_MATCH)
    .sort((a, b) => b.score - a.score || b.option.date.localeCompare(a.option.date) || a.option.price - b.option.price)
    .slice(0, limit);
}

/**
 * The quantity to order in the supplier's unit of measure, from what the recipes need. Only exact conversions are made (g ↔ kg,
 * ml ↔ litre, pieces); when the supplier sells it in another kind of unit (a packet, a bottle ...) there is no quantity: the person
 * enters it. Pieces and units that are bought whole are rounded up; weights and volumes are rounded up to 2 decimals so the order is never short.
 */
export function quantityInUom(need: Base, uom: string): { qty: number | null; reason?: "unit" } {
  const sup = toBase(1, uom);
  const same = sup.family === need.family && sup.key === need.key;
  if (!same || !(sup.qty > 0)) return { qty: null, reason: "unit" };
  const raw = need.qty / sup.qty;
  if (need.family === "count") return { qty: Math.ceil(raw - 1e-9) };
  return { qty: Math.ceil(raw * 100 - 1e-9) / 100 };
}
