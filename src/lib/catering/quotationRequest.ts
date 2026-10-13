import type { EventDay } from "@/lib/catering/days";

/** A extra line a sales agent adds to the quotation request (transport, equipment hire, service charge, ...). */
export type ExtraItem = { itemName: string; quantity: number; unitPrice: number };

export type QuotationRequestInput = {
  salesAgent: string;
  customerName: string;
  eventName: string;
  eventType: string;
  location?: string;
  picName?: string;
  picPhone?: string;
  kitchenSetup?: string;
  cateringSetup?: string;
  remarks?: string;
  /** One block per event day (a single-day event has one). */
  days: EventDay[];
  extraItems: ExtraItem[];
  /** Optional alternative menu for the whole event. */
  secondChoice?: SecondChoice;
  /** The ticked additional equipment / services. */
  additional?: AdditionalServices;
  /** Honeypot: real people leave it empty. */
  website?: string;
};

export const MAX_EXTRA_ITEMS = 30;

/**
 * An alternative menu for the whole event ("second choice"): menu, pax, meal types, service type and price per meal.
 * It is shown to the office and kept with the event; it is not added to the quotation total.
 */
export type SecondChoice = {
  menu: string;
  pax?: number;
  mealTypes: string[];
  serviceType: string;
  pricePerMeal?: number;
};

export const emptySecondChoice = (): SecondChoice => ({ menu: "", mealTypes: [], serviceType: "" });

/** The tick-boxes under "Additional equipment": each ticked one becomes a line of the quotation. */
export type AdditionalServices = {
  equipmentHandling: boolean;
  /** Optional: the office can price it later. */
  equipmentHandlingPrice?: number;
  staffServing: boolean;
  /** RM per pax, charged for every serving of the event (all days). */
  staffServingPricePerPax?: number;
  transportation: boolean;
  /** RM for the whole event. */
  transportationPrice?: number;
};

export const noAdditionalServices = (): AdditionalServices => ({ equipmentHandling: false, staffServing: false, transportation: false });

/** The quotation lines for the ticked additional services. `totalServings` is the pax of all days added together. */
export function additionalServiceLines(a: AdditionalServices | undefined, totalServings: number): ExtraItem[] {
  if (!a) return [];
  const lines: ExtraItem[] = [];
  if (a.equipmentHandling) lines.push({ itemName: "Equipment handling", quantity: 1, unitPrice: a.equipmentHandlingPrice ?? 0 });
  if (a.staffServing) lines.push({ itemName: "Staff serving (per pax)", quantity: totalServings, unitPrice: a.staffServingPricePerPax ?? 0 });
  if (a.transportation) lines.push({ itemName: "Transportation", quantity: 1, unitPrice: a.transportationPrice ?? 0 });
  return lines;
}

/** Plain-text version of the second choice, written into the event details when the request is approved. */
export function describeSecondChoice(c: SecondChoice, labels: { meal: Record<string, string>; service: Record<string, string> }): string {
  return [
    "Second choice (an alternative menu offered to the customer; not included in the quotation):",
    `Menu: ${c.menu}`,
    `Qty pax: ${c.pax ?? "-"}`,
    `Meal type: ${c.mealTypes.map((m) => labels.meal[m] ?? m).join(", ") || "-"}`,
    `Service type: ${labels.service[c.serviceType] ?? c.serviceType}`,
    `Price / meal: ${c.pricePerMeal !== undefined ? `RM ${c.pricePerMeal.toFixed(2)}` : "-"}`,
  ].join("\n");
}
