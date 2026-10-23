/**
 * Units of measure for the kitchen calculator. Only conversions that are exact are made (g ↔ kg, ml ↔ l, piece names);
 * a unit like "BTL" or "PKT" is never turned into weight, so it stays a line of its own.
 */
export type Family = "mass" | "volume" | "count" | "other";

/** A quantity in the base unit of its family: grams, millilitres, pieces, or the unit itself for "other". */
export type Base = { qty: number; family: Family; /** "g" | "ml" | "pcs" | the unit text for "other" */ key: string };

const MASS: Record<string, number> = { G: 1, GM: 1, GRAM: 1, GRAMS: 1, GR: 1, KG: 1000, KGS: 1000, KILO: 1000, KILOGRAM: 1000, KILOGRAMS: 1000 };
const VOLUME: Record<string, number> = { ML: 1, L: 1000, LT: 1000, LTR: 1000, LITER: 1000, LITRE: 1000, LITERS: 1000, LITRES: 1000 };
const COUNT = new Set(["PCS", "PC", "PIECE", "PIECES", "NOS", "NO", "BIJI", "HELAI", "BUTIR", "EKOR", "KEPING", "UNIT", "UNITS"]);

const clean = (u: string | null | undefined) => (u ?? "").toUpperCase().replace(/[^A-Z]/g, "");

export function toBase(qty: number, unit: string | null | undefined): Base {
  const u = clean(unit);
  if (u in MASS) return { qty: qty * MASS[u], family: "mass", key: "g" };
  if (u in VOLUME) return { qty: qty * VOLUME[u], family: "volume", key: "ml" };
  if (COUNT.has(u) || u === "") return { qty, family: "count", key: "pcs" };
  return { qty, family: "other", key: u };
}

export type UnitMode = "auto" | "kg";

/** A quantity ready to show: kg / L from 1000 g / ml (or always, in "kg" mode), grams, millilitres, pieces or the unit as written. */
export function display(b: Base, mode: UnitMode = "auto"): { qty: number; unit: string } {
  if (b.family === "mass") {
    if (mode === "kg" || b.qty >= 1000) return { qty: round(b.qty / 1000, 3), unit: "kg" };
    return { qty: round(b.qty, b.qty >= 10 ? 0 : 1), unit: "g" };
  }
  if (b.family === "volume") {
    if (mode === "kg" || b.qty >= 1000) return { qty: round(b.qty / 1000, 3), unit: "litres" };
    return { qty: round(b.qty, b.qty >= 10 ? 0 : 1), unit: "ml" };
  }
  if (b.family === "count") return { qty: round(b.qty, 2), unit: "pcs" };
  return { qty: round(b.qty, 2), unit: b.key.toLowerCase() };
}

export function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** "1,250" style text without trailing zeros. */
export function formatQty(n: number): string {
  return new Intl.NumberFormat("en-MY", { maximumFractionDigits: 3 }).format(n);
}

/** Two quantities can be added or compared only when they are in the same family and, for "other", the same unit. */
export function sameKind(a: Base, b: Base): boolean {
  return a.family === b.family && a.key === b.key;
}
