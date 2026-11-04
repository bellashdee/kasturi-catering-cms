import { MEAL_TYPE_LABEL, SERVICE_TYPE_LABEL } from "@/lib/catering/constants";

/**
 * An optional second menu for one day: menu, pax, meal types, service type and price per meal.
 * Its amount (pax x price per meal) is added to the amount of the day, so it is part of the total.
 */
export type SecondChoice = {
  menu: string;
  pax?: number;
  mealTypes: string[];
  serviceType: string;
  pricePerMeal?: number;
};

export const emptySecondChoice = (): SecondChoice => ({ menu: "", mealTypes: [], serviceType: "" });

/** A day can have up to this many second menus (for example one for each meal type). */
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
  /** Only on a quotation request: when the event ends (an event day has no end time yet). */
  endTime?: string;
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

/** The amount of the main menu of a day: its pax x the price per pax. */
export function dayMainAmount(day: EventDay): number {
  return Math.round(dayPax(day) * (day.pricePerPax ?? 0) * 100) / 100;
}

/** The amount of one second menu: its pax x its price per meal. */
export function secondMenuAmount(c: SecondChoice): number {
  return Math.round((c.pax ?? 0) * (c.pricePerMeal ?? 0) * 100) / 100;
}

/** The amount of the second menus of a day. */
export function daySecondMenusAmount(day: EventDay): number {
  return Math.round(secondMenusOf(day).reduce((t, c) => t + secondMenuAmount(c), 0) * 100) / 100;
}

/** The amount of a day: the main menu plus the second menus. */
export function dayAmount(day: EventDay): number {
  return Math.round((dayMainAmount(day) + daySecondMenusAmount(day)) * 100) / 100;
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
      .flatMap((d, i) => [
        { itemName: dayLineName(d, i), quantity: dayPax(d), unitPrice: d.pricePerPax ?? 0 },
        // each second menu is a line of its own (its pax x its price per meal), so that the quotation adds up to the same total
        ...secondMenusOf(d).map((c, n) => ({
          itemName: `Day ${i + 1} (${shortDate(d.dayDate)}) — Second menu ${n + 1}${c.menu.trim() ? `: ${c.menu.trim().split("\n")[0]}` : ""}`,
          quantity: c.pax ?? 0,
          unitPrice: c.pricePerMeal ?? 0,
        })),
      ])
      .filter((r) => r.quantity > 0 && r.unitPrice > 0);
  }
  if (single.pax && single.pricePerPax) return [{ itemName: single.eventName, quantity: single.pax, unitPrice: single.pricePerPax }];
  return [];
}

/** The menu items of a day: one on each line, blank lines and spaces taken out. */
export function menuRows(text: string | null | undefined): string[] {
  return (text ?? "").split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/** The menu of a day as it is saved: one item on each line, no blank lines. */
export function normalizeMenu(text: string | null | undefined): string {
  return menuRows(text).join("\n");
}
