/**
 * Scales a reference ingredient quantity to a different pax count. The
 * original reference quantity/pax is never mutated — this always computes
 * fresh from the base values.
 */
export function calculateQuantity(baseQuantity: number | null, basePax: number, requiredPax: number): number | null {
  if (baseQuantity === null || basePax <= 0) return null;
  return (baseQuantity / basePax) * requiredPax;
}

export function formatQuantity(qty: number | null): string {
  if (qty === null) return "—";
  const rounded = Math.round(qty * 100) / 100;
  return rounded.toLocaleString("en-MY", { maximumFractionDigits: 2 });
}

export const MEAL_ORDER = ["breakfast", "lunch", "dinner"] as const;
export const MEAL_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};
