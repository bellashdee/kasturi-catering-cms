/**
 * Recipe costing of the restaurant (phase 2). Pure functions, no database.
 *
 *   cost per usable unit of an ingredient = unit cost ÷ (yield % ÷ 100)         (a whole fish bought by the kg, 60 % usable: RM 18 / kg costs RM 30 / usable kg)
 *   cost of a line  = quantity (in the unit of the cost) × cost per usable unit ÷ (1 − waste % ÷ 100)
 *   cost of a recipe = sum of its lines;   cost per portion = cost of the recipe ÷ portions the recipe makes
 *   food cost % = cost per portion ÷ selling price;   profit per serving = selling price − cost per portion
 *
 * A line whose unit cannot be turned into the unit of the cost (kg to pcs), or that has no unit cost, has NO cost: the recipe is then "cost incomplete"
 * and no total is shown as a figure. Nothing is guessed.
 */
export const UNITS = ["kg", "g", "l", "ml", "pcs", "pack", "carton", "bottle", "tray", "bag", "box", "tin", "bunch"] as const;

const MASS: Record<string, number> = { g: 1, kg: 1000 };
const VOLUME: Record<string, number> = { ml: 1, l: 1000 };

const ALIASES: Record<string, string> = {
  gram: "g", grams: "g", gm: "g", gms: "g",
  kilo: "kg", kilos: "kg", kgs: "kg", kilogram: "kg", kilograms: "kg",
  litre: "l", liter: "l", litres: "l", liters: "l", ltr: "l", lt: "l",
  millilitre: "ml", milliliter: "ml", mls: "ml",
  pc: "pcs", piece: "pcs", pieces: "pcs", biji: "pcs", nos: "pcs", unit: "pcs",
  packet: "pack", pkt: "pack", btl: "bottle", ctn: "carton", cartons: "carton",
};

export function normUnit(unit: string | null | undefined): string {
  const u = (unit ?? "").trim().toLowerCase().replace(/\./g, "");
  return ALIASES[u] ?? u;
}

/** A quantity in another unit of the same kind (kg ↔ g, l ↔ ml); the same unit as it is; anything else cannot be turned (null). */
export function convert(quantity: number, from: string, to: string): number | null {
  const a = normUnit(from);
  const b = normUnit(to);
  if (!a || !b) return null;
  if (a === b) return quantity;
  if (a in MASS && b in MASS) return (quantity * MASS[a]) / MASS[b];
  if (a in VOLUME && b in VOLUME) return (quantity * VOLUME[a]) / VOLUME[b];
  return null;
}

export type CostLine = { quantity: number; unit: string; waste_pct: number; unit_cost: number | null; cost_unit: string | null; yield_pct: number };

export type LineCost = { cost: number | null; reason: "ok" | "no_price" | "unit_mismatch" };

export function lineCost(l: CostLine): LineCost {
  if (l.unit_cost === null || !(l.unit_cost > 0)) return { cost: null, reason: "no_price" };
  const q = convert(Number(l.quantity), l.unit, l.cost_unit ?? "");
  if (q === null) return { cost: null, reason: "unit_mismatch" };
  const yieldShare = Number(l.yield_pct) / 100;
  const waste = Number(l.waste_pct) / 100;
  if (!(yieldShare > 0) || waste < 0 || waste >= 1) return { cost: null, reason: "no_price" };
  return { cost: (q * (Number(l.unit_cost) / yieldShare)) / (1 - waste), reason: "ok" };
}

export type RecipeCost = {
  /** the cost of the whole recipe; null while a line has no cost */
  total: number | null;
  perPortion: number | null;
  complete: boolean;
  lines: LineCost[];
};

export function recipeCost(lines: CostLine[], portionYield: number): RecipeCost {
  const costs = lines.map(lineCost);
  const complete = lines.length > 0 && costs.every((c) => c.cost !== null) && portionYield > 0;
  const total = complete ? costs.reduce((t, c) => t + (c.cost as number), 0) : null;
  return { total, perPortion: total === null ? null : total / portionYield, complete, lines: costs };
}

export type Margin = { profit: number | null; foodCostPct: number | null; marginPct: number | null };

/** Profit per serving, food cost % and gross margin %: only from a complete cost and a selling price above 0. */
export function margin(price: number | null, costPerPortion: number | null): Margin {
  if (price === null || !(price > 0) || costPerPortion === null) return { profit: null, foodCostPct: null, marginPct: null };
  return { profit: price - costPerPortion, foodCostPct: (costPerPortion / price) * 100, marginPct: ((price - costPerPortion) / price) * 100 };
}

export const REASON_TEXT: Record<LineCost["reason"], string> = {
  ok: "",
  no_price: "No unit cost",
  unit_mismatch: "The unit cannot be turned into the unit of the cost",
};
