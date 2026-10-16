import type { EventDay, SecondChoice } from "@/lib/catering/days";

export type { SecondChoice };

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
  /** The answered additional requirement (equipment handling, staff serving, transportation). */
  additional?: AdditionalServices;
  /** Honeypot: real people leave it empty. */
  website?: string;
};

export const MAX_EXTRA_ITEMS = 30;

/** The tick-boxes under "Additional requirement": each one answered Yes becomes a line of the quotation. */
export type AdditionalServices = {
  /** true = yes, false = no, null = not answered yet (the public form requires an answer for each). */
  equipmentHandling: boolean | null;
  /** Optional: the office can price it later. */
  equipmentHandlingPrice?: number;
  staffServing: boolean | null;
  /** RM per pax, charged for every serving of the event (all days). */
  staffServingPricePerPax?: number;
  transportation: boolean | null;
  /** RM for the whole event. */
  transportationPrice?: number;
  domeSet: boolean | null;
  /** Optional: the office can price it later. */
  domeSetPrice?: number;
};

export const noAdditionalServices = (): AdditionalServices => ({ equipmentHandling: false, staffServing: false, transportation: false, domeSet: false });

/** The form starts with nothing answered: each of the three must be answered Yes or No before the request can be sent. */
export const unansweredAdditionalServices = (): AdditionalServices => ({ equipmentHandling: null, staffServing: null, transportation: null, domeSet: null });

/** The quotation lines for the ticked additional services. `totalServings` is the pax of all days added together. */
export function additionalServiceLines(a: AdditionalServices | undefined, totalServings: number): ExtraItem[] {
  if (!a) return [];
  const lines: ExtraItem[] = [];
  if (a.equipmentHandling) lines.push({ itemName: "Equipment handling", quantity: 1, unitPrice: a.equipmentHandlingPrice ?? 0 });
  if (a.staffServing) lines.push({ itemName: "Staff serving (per pax)", quantity: totalServings, unitPrice: a.staffServingPricePerPax ?? 0 });
  if (a.transportation) lines.push({ itemName: "Transportation", quantity: 1, unitPrice: a.transportationPrice ?? 0 });
  if (a.domeSet) lines.push({ itemName: "Dome set", quantity: 1, unitPrice: a.domeSetPrice ?? 0 });
  return lines;
}

/** Plain-text version of one second menu of a day, written into the event when the request is approved. */
export function describeSecondChoice(c: SecondChoice, labels: { meal: Record<string, string>; service: Record<string, string> }, number?: number): string {
  return [
    `Second menu${number ? ` ${number}` : ""} (an alternative menu offered to the customer; not included in the quotation):`,
    `Menu: ${c.menu}`,
    `Qty pax: ${c.pax ?? "-"}`,
    `Meal type: ${c.mealTypes.map((m) => labels.meal[m] ?? m).join(", ") || "-"}`,
    `Service type: ${labels.service[c.serviceType] ?? c.serviceType}`,
    `Price / meal: ${c.pricePerMeal !== undefined ? `RM ${c.pricePerMeal.toFixed(2)}` : "-"}`,
  ].join("\n");
}
