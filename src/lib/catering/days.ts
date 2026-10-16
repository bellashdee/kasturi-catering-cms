import { MEAL_TYPE_LABEL, SERVICE_TYPE_LABEL } from "@/lib/catering/constants";

/**
 * An optional alternative menu for one day ("second menu"): menu, pax, meal types, service type and price per meal.
 * It is shown to the office and kept in the day's remarks on approval; it is not added to the quotation total.
 */
export type SecondChoice = {
  menu: string;
  pax?: number;
  mealTypes: string[];
  serviceType: string;
  pricePerMeal?: number;
};

export const emptySecondChoice = (): SecondChoice => ({ menu: "", mealTypes: [], serviceType: "" });

/** A day can have up to this many second menus (one for each meal type: breakfast, lunch, hi-tea, dinner, wedding). */
export const MAX_SECOND_MENUS = 5;

/** The second menus of a day. Requests saved earlier kept a single "second choice", which counts as the first second menu. */
export function secondMenusOf(day: { secondMenus?: SecondChoice[]; secondChoice?: SecondChoice }): SecondChoice[] {
  return day.secondMenus ?? (day.secondChoice ? [day.secondChoice] : []);
}

/** One day of a multi-day event, as the form and the database both describe it. */
export type EventDay = {
  dayDate: string;
  setupTime?: string;
  eventTime?: string;
  mealTypes: string[];
  serviceType: string;
  servicePax?: number;
  secondServiceType?: string;
  secondServicePax?: number;
  menuDetails?: string;
  pricePerPax?: number;
  remarks?: string;
  /** Only filled in by the public quotation request form: up to 5 optional alternative menus for the day. */
  secondMenus?: SecondChoice[];
  /** Older requests: the single second choice (read through secondMenusOf; new requests use secondMenus). */
  secondChoice?: SecondChoice;
};

/** Total guests for one day: the first service type's pax plus the second's. */
export function dayPax(day: Pick<EventDay, "servicePax" | "secondServiceType" | "secondServicePax">): number {
  return (day.servicePax ?? 0) + (day.secondServiceType ? day.secondServicePax ?? 0 : 0);
}

export function dayAmount(day: EventDay): number {
  return Math.round(dayPax(day) * (day.pricePerPax ?? 0) * 100) / 100;
}

const shortDate = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

/** "Hari 1 (18/11) — Lunch, Hi-Tea — Buffet / Pack Food: Nasi Ayam ..." — the line a quotation shows for a day. */
export function dayLineName(day: EventDay, index: number): string {
  const meals = day.mealTypes.map((m) => MEAL_TYPE_LABEL[m] ?? m).join(", ");
  const services = [day.serviceType, day.secondServiceType]
    .filter((s): s is string => !!s)
    .map((s) => SERVICE_TYPE_LABEL[s] ?? s)
    .join(" / ");
  const menu = day.menuDetails?.trim().split("\n")[0];
  return [`Day ${index + 1} (${shortDate(day.dayDate)})`, meals, services].filter(Boolean).join(" — ") + (menu ? `: ${menu}` : "");
}

export type QuotationSeedRow = { itemName: string; quantity: number; unitPrice: number };

/**
 * Starting rows for a quotation: one per day of a multi-day event, or one for a single-day event.
 * Only days (or events) that have a price per pax and guests are seeded — nothing is made up.
 */
export function quotationSeedRows(
  days: EventDay[],
  single: { eventName: string; pax: number | null; pricePerPax: number | null },
): QuotationSeedRow[] {
  if (days.length > 0) {
    return days
      .map((d, i) => ({ itemName: dayLineName(d, i), quantity: dayPax(d), unitPrice: d.pricePerPax ?? 0 }))
      .filter((r) => r.quantity > 0 && r.unitPrice > 0);
  }
  if (single.pax && single.pricePerPax) return [{ itemName: single.eventName, quantity: single.pax, unitPrice: single.pricePerPax }];
  return [];
}
