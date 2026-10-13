import { DAY_LABEL, DAY_ORDER, MEAL_LABEL, MEAL_ORDER } from "@/lib/menuPlan/calc";

/** A meal session is breakfast / lunch / dinner, or a weekday for a menu written per day (monday ... sunday). */
export function sessionLabel(session: string): string {
  return MEAL_LABEL[session] ?? DAY_LABEL[session] ?? (session === "daily" ? "Daily menu" : session);
}

/** Breakfast, lunch, dinner, then Monday to Sunday. */
export function sessionRank(session: string): number {
  const meal = (MEAL_ORDER as readonly string[]).indexOf(session);
  if (meal >= 0) return meal;
  const day = (DAY_ORDER as readonly string[]).indexOf(session);
  return day >= 0 ? 10 + day : 99;
}
