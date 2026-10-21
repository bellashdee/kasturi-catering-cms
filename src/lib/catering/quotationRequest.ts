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

/**
 * What the sales agent answered under "Additional requirement", for the event page: every question with Yes / No and its price.
 * Requests sent before the answers were kept have none: the Yes answers are read back from their quotation lines, and Dome set
 * (asked later) is only listed when it was ticked.
 */
export function additionalRows(a: AdditionalServices | null | undefined, extras: ExtraItem[] = []): { label: string; yes: boolean; detail: string }[] {
  const price = (n: number | undefined, perPax = false) => (n && n > 0 ? `RM ${n.toFixed(2)}${perPax ? " per pax" : ""}` : "");
  if (a) {
    return [
      { label: "Equipment handling", yes: !!a.equipmentHandling, detail: a.equipmentHandling ? price(a.equipmentHandlingPrice) : "" },
      { label: "Staff serving", yes: !!a.staffServing, detail: a.staffServing ? price(a.staffServingPricePerPax, true) : "" },
      { label: "Transportation", yes: !!a.transportation, detail: a.transportation ? price(a.transportationPrice) : "" },
      { label: "Dome set", yes: !!a.domeSet, detail: a.domeSet ? price(a.domeSetPrice) : "" },
    ];
  }
  const line = (name: string) => extras.find((i) => i.itemName === name);
  const rows = [
    { label: "Equipment handling", item: line("Equipment handling"), perPax: false },
    { label: "Staff serving", item: line("Staff serving (per pax)"), perPax: true },
    { label: "Transportation", item: line("Transportation"), perPax: false },
    { label: "Dome set", item: line("Dome set"), perPax: false },
  ];
  return rows
    .filter((r) => r.item || r.label !== "Dome set")
    .map((r) => ({ label: r.label, yes: !!r.item, detail: r.item ? price(r.item.unitPrice, r.perPax) : "" }));
}

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
