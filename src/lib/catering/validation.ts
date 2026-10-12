import { MAX_EVENT_DAYS, MEAL_TYPE_LABEL, SERVICE_TYPE_LABEL } from "@/lib/catering/constants";
import type { EventDay } from "@/lib/catering/days";

/** The service-type fields shared by a single-day event and one day of a multi-day event. */
export type ServiceInput = {
  mealTypes?: string[];
  serviceType?: string;
  servicePax?: number;
  secondServiceType?: string;
  secondServicePax?: number;
};

export function validateServiceDetails(input: ServiceInput, required: boolean) {
  if (required && !input.serviceType) throw new Error("Select the service type (the first choice is required).");
  const validPax = (n: number | undefined) => n !== undefined && Number.isInteger(n) && n > 0;
  if (input.serviceType && !validPax(input.servicePax)) throw new Error("State how many pax for the first service type.");
  if (!input.serviceType && input.servicePax !== undefined) throw new Error("Select the service type for the pax entered.");
  if (input.secondServiceType && !validPax(input.secondServicePax)) throw new Error("State how many pax for the second service type.");
  if (!input.secondServiceType && input.secondServicePax !== undefined) throw new Error("Select the second service type for the pax entered.");
  if (input.serviceType && !SERVICE_TYPE_LABEL[input.serviceType]) throw new Error("Select a valid service type.");
  if (input.secondServiceType) {
    if (!SERVICE_TYPE_LABEL[input.secondServiceType]) throw new Error("Select a valid second service type.");
    if (!input.serviceType) throw new Error("Select the first service type before a second one.");
    if (input.secondServiceType === input.serviceType) throw new Error("The second service type must be different from the first.");
  }
  for (const m of input.mealTypes ?? []) if (!MEAL_TYPE_LABEL[m]) throw new Error("Select a valid meal type.");
}

export function validateDays(days: EventDay[]) {
  if (days.length > MAX_EVENT_DAYS) throw new Error(`A multi-day event can have at most ${MAX_EVENT_DAYS} days.`);
  const seen = new Set<string>();
  days.forEach((day, i) => {
    const label = `Day ${i + 1}`;
    if (!day.dayDate) throw new Error(`${label}: pick the date.`);
    if (seen.has(day.dayDate)) throw new Error(`${label}: the date ${day.dayDate} is already used by another day.`);
    seen.add(day.dayDate);
    try {
      validateServiceDetails(day, true);
    } catch (e) {
      throw new Error(`${label}: ${e instanceof Error ? e.message : "check the service details."}`);
    }
    if (day.pricePerPax !== undefined && !(day.pricePerPax >= 0)) throw new Error(`${label}: the price per pax cannot be negative.`);
  });
}

