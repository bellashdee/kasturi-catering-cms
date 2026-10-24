import { tokens } from "@/lib/kitchenAi/match";
import { toBase, type Base } from "@/lib/kitchenAi/units";
import { aliasesOf } from "./aliases";

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

/** Below this a supplier item is not even suggested; from AUTO_MATCH up it is chosen automatically (the person can change it). */
const MIN_MATCH = 0.45;
export const AUTO_MATCH = 0.62;

/** One-word names that say what kind of thing it is, not which one ("AIR" is not "AIR FILTER"): never chosen automatically. */
const GENERIC = new Set(["AIR", "AYAM", "IKAN", "DAGING", "BUAH", "SAYUR", "MINYAK", "GULA", "SERBUK", "PES", "PASTE", "REMPAH", "SOS", "BERAS", "TEPUNG", "KICAP", "DAUN", "BUNGA", "KACANG", "LADA", "CILI", "BAWANG", "HERB", "SALAD", "PERASA", "BUTTER", "KAMBING", "LAMB", "CUKA", "ASAM", "SUSU", "TELUR", "UDANG"]);

/** An ingredient name as it is kept when a match is saved: upper case letters and numbers, single spaces. */
export const ingredientKey = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

/** A supplier item name without the pack size and brackets ("MADU (1KG)" is "MADU"; "BOLA MERAH @ CAPSICUM" keeps both names). */
function cleanItem(description: string): string {
  return description
    .toUpperCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\d+(?:[.,]\d+)?\s*(?:KG|KGS|G|GM|GR|GRAM|ML|L|LT|LTR|PCS|PC|PKT|BTL|CTN|BAG|X\d+)/g, " ")
    .replace(/@/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const editDistance = (a: string, b: string): number => {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
};

/** The same word, or the same word spelt a little differently (6 letters or more, one letter apart, same first letter). */
const sameWord = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 6 && a[0] === b[0] && !/\d/.test(a + b) && editDistance(a, b) <= 1);

/**
 * How well a supplier item name fits an ingredient (0 to 1). The same words in any order score highest; all the words of the ingredient
 * inside a longer item name score well; a single word that is only the start of a longer name is just a suggestion (and never automatic
 * for words like AIR or AYAM, which say the kind of thing and not which one).
 */
export function matchScore(ingredient: string, description: string, alias = false): number {
  const it = tokens(ingredient);
  const dt = tokens(cleanItem(description));
  if (it.length === 0 || dt.length === 0) return 0;
  const found = it.filter((t) => dt.some((d) => sameWord(t, d)));
  if (found.length < it.length) return 0;
  if (it.length === dt.length) return alias ? 0.97 : 1;
  if (it.length >= 2) return Math.min(0.97, 0.72 + 0.25 * (it.length / dt.length)) * (alias ? 0.97 : 1);
  // one word, with more words in the item name
  const first = sameWord(it[0], dt[0]);
  if (!first) return 0.46;
  if (GENERIC.has(it[0]) && !alias) return 0.5;
  return alias ? 0.72 : 0.66;
}

/**
 * The supplier items that look like an ingredient, best first: the one the person saved for it comes first, then the best fit by
 * name (also through the other names the kitchen and suppliers use for it). Among equally good ones, the most recent purchase comes
 * first. A suggestion only: the person can choose any other item.
 */
export function rankSupplierItems(ingredient: string, items: SupplierItemOption[], limit = 8, saved?: Map<string, string>): { option: SupplierItemOption; score: number }[] {
  const savedKey = saved?.get(ingredientKey(ingredient));
  const aliases = aliasesOf(ingredient);
  return items
    .map((option) => {
      if (savedKey && option.key === savedKey) return { option, score: 2 };
      let score = matchScore(ingredient, option.description);
      for (const a of aliases) score = Math.max(score, matchScore(a, option.description, true));
      return { option, score };
    })
    .filter((x) => x.score >= MIN_MATCH)
    .sort((a, b) => b.score - a.score || b.option.date.localeCompare(a.option.date) || a.option.price - b.option.price)
    .slice(0, limit);
}

/** The item chosen on its own for an ingredient: the saved one or a fitting one, never a weak guess. */
export function bestSupplierItem(ingredient: string, items: SupplierItemOption[], saved?: Map<string, string>): SupplierItemOption | null {
  const top = rankSupplierItems(ingredient, items, 1, saved)[0];
  return top && top.score >= AUTO_MATCH ? top.option : null;
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
