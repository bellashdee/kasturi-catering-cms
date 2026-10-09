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

export const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export const DAY_LABEL: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

type MealLike = { meal_time: string; day_of_week?: string | null };

/** Breakfast / Lunch / Dinner, or the weekday for a menu written per day. */
export function mealTitle(meal: MealLike): string {
  if (meal.meal_time === "daily") return meal.day_of_week ? (DAY_LABEL[meal.day_of_week] ?? meal.day_of_week) : "Daily";
  return MEAL_LABEL[meal.meal_time] ?? meal.meal_time;
}

/** Sort key: breakfast, lunch, dinner, then the daily menus Monday to Sunday. */
export function mealRank(meal: MealLike): number {
  if (meal.meal_time === "daily") return 10 + DAY_ORDER.indexOf((meal.day_of_week ?? "") as never);
  return MEAL_ORDER.indexOf(meal.meal_time as never);
}
