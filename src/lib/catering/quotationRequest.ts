import { MEAL_TYPE_LABEL, SERVICE_TYPE_LABEL } from "@/lib/catering/constants";
import { secondMenusOf, type EventDay, type SecondChoice } from "@/lib/catering/days";

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
  /** Optional: RM for the whole event. */
  staffServingPrice?: number;
  transportation: boolean | null;
  /** RM for the whole event. */
  transportationPrice?: number;
  domeSet: boolean | null;
  /** How many dome sets (requests sent before it was asked count as 1 set). */
  domeSetQuantity?: number;
  /** Optional: RM for one set; the office can price it later. */
  domeSetPrice?: number;
  /** "Included in the food price": the service is given (the answer is Yes) but nothing is added to the quotation. */
  equipmentHandlingIncluded?: boolean;
  staffServingIncluded?: boolean;
  transportationIncluded?: boolean;
  domeSetIncluded?: boolean;
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
  const detail = (yes: boolean | null, included: boolean | undefined, n: number | undefined) => (!yes ? "" : included ? "Included in the food price" : price(n));
  if (a) {
    return [
      { label: "Equipment handling", yes: !!a.equipmentHandling, detail: detail(a.equipmentHandling, a.equipmentHandlingIncluded, a.equipmentHandlingPrice) },
      { label: "Staff serving", yes: !!a.staffServing, detail: detail(a.staffServing, a.staffServingIncluded, a.staffServingPrice) },
      { label: "Transportation", yes: !!a.transportation, detail: detail(a.transportation, a.transportationIncluded, a.transportationPrice) },
      { label: "Dome set", yes: !!a.domeSet, detail: a.domeSet ? domeSetDetail(a.domeSetQuantity ?? 1, a.domeSetIncluded ? null : a.domeSetPrice) : "" },
    ];
  }
  const line = (name: string) => extras.find((i) => i.itemName === name);
  const rows = [
    { label: "Equipment handling", item: line("Equipment handling"), perPax: false },
    // requests sent earlier priced staff serving per pax
    { label: "Staff serving", item: line("Staff serving") ?? line("Staff serving (per pax)"), perPax: !line("Staff serving") },
    { label: "Transportation", item: line("Transportation"), perPax: false },
    { label: "Dome set", item: line("Dome set"), perPax: false },
  ];
  return rows
    .filter((r) => r.item || r.label !== "Dome set")
    .map((r) => ({
      label: r.label,
      yes: !!r.item,
      detail: !r.item ? "" : r.label === "Dome set" ? domeSetDetail(r.item.quantity, r.item.unitPrice) : price(r.item.unitPrice, r.perPax),
    }));
}

/** "3 sets × RM 50.00 per set = RM 150.00", or "3 sets · Included in the food price" (price null). */
function domeSetDetail(sets: number, pricePerSet: number | null | undefined): string {
  const count = `${sets} set${sets === 1 ? "" : "s"}`;
  if (pricePerSet === null) return `${count} · Included in the food price`;
  return pricePerSet && pricePerSet > 0 ? `${count} × RM ${pricePerSet.toFixed(2)} per set = RM ${(sets * pricePerSet).toFixed(2)}` : count;
}

/** The quotation lines for the ticked additional services. */
export function additionalServiceLines(a: AdditionalServices | undefined): ExtraItem[] {
  if (!a) return [];
  const lines: ExtraItem[] = [];
  // a service that is included in the food price is written on the quotation at RM 0.00, so the customer sees that it is given
  const add = (yes: boolean | null, included: boolean | undefined, name: string, price: number | undefined, quantity = 1) => {
    if (yes) lines.push({ itemName: included ? `${name} (included in the food price)` : name, quantity, unitPrice: included ? 0 : (price ?? 0) });
  };
  add(a.equipmentHandling, a.equipmentHandlingIncluded, "Equipment handling", a.equipmentHandlingPrice);
  add(a.staffServing, a.staffServingIncluded, "Staff serving", a.staffServingPrice);
  add(a.transportation, a.transportationIncluded, "Transportation", a.transportationPrice);
  // dome sets: quantity = number of sets, unit price = price per set
  add(a.domeSet, a.domeSetIncluded, "Dome set", a.domeSetPrice, a.domeSetQuantity ?? 1);
  return lines;
}

/** A day with its second menus written into its remarks (a saved day has no place of its own for them); they are not part of the quotation. */
export function withSecondMenusInRemarks(d: EventDay): EventDay {
  const menus = secondMenusOf(d);
  return {
    ...d,
    remarks:
      [d.remarks, ...menus.map((m, n) => describeSecondChoice(m, { meal: MEAL_TYPE_LABEL, service: SERVICE_TYPE_LABEL }, menus.length > 1 ? n + 1 : undefined))]
        .filter(Boolean)
        .join("\n\n") || undefined,
  };
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
