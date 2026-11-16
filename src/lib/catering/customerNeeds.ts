import {
  FORM_REQUIREMENT_FIELDS,
  MAX_EXTRA_ITEMS,
  REQUIREMENT_FIELDS,
  additionalServiceLines,
  unansweredAdditionalServices,
  type AdditionalServices,
  type ExtraItem,
  type RequestRequirements,
} from "@/lib/catering/quotationRequest";

/**
 * "What the customer needs": one section, the same on the sales agents' Quotation Request Form (public link) and on
 * New Event / Edit Event in the app. Both save the same fields (requirements, additional, extra items, kitchen set-up,
 * catering set-up, remarks), so a request and the event made from it show the same answers.
 */

/** One extra item as it is typed (quantity and price stay text until the form is sent). */
export type ExtraRow = { itemName: string; quantity: string; unitPrice: string };

export type CustomerNeedsValue = {
  requirements: RequestRequirements;
  additional: AdditionalServices;
  extras: ExtraRow[];
  kitchenSetup: string;
  cateringSetup: string;
  remarks: string;
};

/** The labels, in the order both forms and both detail pages show them. */
export const NEEDS_LABEL = {
  section: "What the customer needs",
  intro: "Fill in what the customer asked for. Leave a box empty when it does not apply.",
  menuOptions: "How many menu choices to quote",
  kitchenSetup: "Kitchen set-up",
  cateringSetup: "Catering set-up",
  additional: "Additional requirement (answer each one) *",
  additionalView: "Additional requirement",
  additionalHelp:
    "Search and choose for each one: Yes (add the price if you know it), No, or Included in the food price. Each Yes is added to the quotation; Included means it is already in the price of the food.",
  extras: "Extra items to add to the quotation",
  extrasHelp: "e.g. canopy hire, equipment hire, service charge.",
  remarks: "Anything else (remarks)",
} as const;

export const KITCHEN_SETUP_PLACEHOLDER = "What the kitchen must prepare / set up";
export const CATERING_SETUP_PLACEHOLDER = "What the catering team sets up on site";

export const emptyCustomerNeeds = (): CustomerNeedsValue => ({
  requirements: {},
  additional: unansweredAdditionalServices(),
  extras: [],
  kitchenSetup: "",
  cateringSetup: "",
  remarks: "",
});

/** The typed rows as quotation lines (an empty row is left out by the server). */
export const extraItemsOf = (rows: ExtraRow[]): ExtraItem[] =>
  rows.map((r) => ({ itemName: r.itemName, quantity: Number(r.quantity) || 0, unitPrice: Number(r.unitPrice) || 0 }));

export const extraRowsOf = (items: ExtraItem[]): ExtraRow[] =>
  items.map((i) => ({ itemName: i.itemName, quantity: String(i.quantity), unitPrice: i.unitPrice ? String(i.unitPrice) : "" }));

/** The extra items typed in by hand: a request's saved list also holds the lines of its additional requirement, which are taken out. */
export function typedExtras(items: ExtraItem[] | null | undefined, additional: AdditionalServices | null | undefined): ExtraItem[] {
  const fromAdditional = new Set(additionalServiceLines(additional ?? undefined).map((l) => l.itemName));
  return (items ?? []).filter((i) => !fromAdditional.has(i.itemName));
}

/**
 * The requirements as the form shows them. Older requests have separate Vegetarian and Tables and chairs boxes:
 * they are put into Allergies and special diets / Equipment, tables and chairs (nothing is lost).
 */
export function formRequirements(r: RequestRequirements | null | undefined): RequestRequirements {
  const out: RequestRequirements = { ...(r ?? {}) };
  const merge = (into: "dietary" | "equipment", from: "vegetarian" | "tableChair", label: string) => {
    const extra = out[from]?.trim();
    if (!extra) return;
    out[into] = out[into]?.trim() ? `${out[into]}\n${label}: ${extra}` : extra;
    delete out[from];
  };
  merge("dietary", "vegetarian", "Vegetarian");
  merge("equipment", "tableChair", "Tables and chairs");
  return out;
}

type NeedsColumns = { requirements: unknown; additional: unknown; extra_items: unknown };

/** The saved answers of a quotation request (its extra items without the additional requirement lines). */
export function requestNeeds(r: NeedsColumns): { requirements: RequestRequirements; additional: AdditionalServices | null; extras: ExtraItem[]; allLines: ExtraItem[] } {
  const additional = (r.additional as AdditionalServices | null) ?? null;
  const allLines = (r.extra_items as ExtraItem[] | null) ?? [];
  return { requirements: (r.requirements as RequestRequirements | null) ?? {}, additional, extras: typedExtras(allLines, additional), allLines };
}

/**
 * The saved answers of an event. An event made from a request before events kept their own answers reads them from that request.
 * `allLines` is what additionalRows() reads the Yes answers from when there are no stored answers (requests from before they were kept).
 */
export function eventNeeds(e: NeedsColumns, linkedRequest?: NeedsColumns | null) {
  const own = e.requirements !== null || e.additional !== null || e.extra_items !== null;
  if (!own && linkedRequest) return requestNeeds(linkedRequest);
  const extras = (e.extra_items as ExtraItem[] | null) ?? [];
  return { requirements: (e.requirements as RequestRequirements | null) ?? {}, additional: (e.additional as AdditionalServices | null) ?? null, extras, allLines: extras };
}

/** The form value of saved answers (kitchen / catering set-up and remarks come from the record itself). */
export function needsFormValue(
  saved: { requirements: RequestRequirements; additional: AdditionalServices | null; extras: ExtraItem[] },
  text: { kitchenSetup?: string | null; cateringSetup?: string | null; remarks?: string | null },
): CustomerNeedsValue {
  return {
    requirements: formRequirements(saved.requirements),
    additional: saved.additional ?? unansweredAdditionalServices(),
    extras: extraRowsOf(saved.extras),
    kitchenSetup: text.kitchenSetup ?? "",
    cateringSetup: text.cateringSetup ?? "",
    remarks: text.remarks ?? "",
  };
}

const clean = (s: string | undefined, max: number) => {
  const v = s?.trim();
  if (!v) return null;
  if (v.length > max) throw new Error("One of the fields is too long.");
  return v;
};

/** Each requirement optional, trimmed and size-limited; the number of menu choices is a whole number from 1 to 20. */
export function sanitizeRequirements(r: RequestRequirements | undefined): RequestRequirements {
  const out: RequestRequirements = {};
  if (r?.menuOptions !== undefined && r.menuOptions !== null) {
    if (!Number.isInteger(r.menuOptions) || r.menuOptions < 1 || r.menuOptions > 20) throw new Error(`${NEEDS_LABEL.menuOptions}: enter a whole number from 1 to 20.`);
    out.menuOptions = r.menuOptions;
  }
  for (const f of REQUIREMENT_FIELDS) {
    const v = clean(r?.[f.key], 1000);
    if (v) out[f.key] = v;
  }
  return out;
}

/** The extra items typed in: an empty row is ignored, a started one needs a name and a quantity above 0. */
export function sanitizeExtras(items: ExtraItem[] | undefined): ExtraItem[] {
  const list = items ?? [];
  if (list.length > MAX_EXTRA_ITEMS) throw new Error(`At most ${MAX_EXTRA_ITEMS} extra items.`);
  return list
    .filter((i) => i.itemName?.trim() || i.unitPrice)
    .map((i, n) => {
      const name = clean(i.itemName, 200);
      if (!name) throw new Error(`Extra item ${n + 1}: enter the item name.`);
      if (!(i.quantity > 0)) throw new Error(`Extra item ${n + 1}: the quantity must be more than 0.`);
      if (!(i.unitPrice >= 0)) throw new Error(`Extra item ${n + 1}: the price cannot be negative.`);
      return { itemName: name, quantity: i.quantity, unitPrice: i.unitPrice };
    });
}

/**
 * The answered additional requirement: Yes (with an optional price), No, or Included in the food price. Every one must be answered;
 * only an event edited from before the answers were kept may leave all four unanswered (then null is kept).
 */
export function sanitizeAdditional(a: AdditionalServices | null | undefined, opts: { allowUnanswered?: boolean } = {}): AdditionalServices | null {
  const answers = [a?.equipmentHandling, a?.staffServing, a?.transportation, a?.domeSet];
  if (opts.allowUnanswered && answers.every((v) => v === null || v === undefined)) return null;
  if (!a || typeof a.equipmentHandling !== "boolean") throw new Error("Additional requirement: answer Equipment handling (Yes, No or Included in the food price).");
  if (typeof a.staffServing !== "boolean") throw new Error("Additional requirement: answer Staff serving (Yes, No or Included in the food price).");
  if (typeof a.transportation !== "boolean") throw new Error("Additional requirement: answer Transportation (Yes, No or Included in the food price).");
  if (typeof a.domeSet !== "boolean") throw new Error("Additional requirement: answer Dome set (Yes, No or Included in the food price).");
  const price = (v: number | undefined, label: string) => {
    if (v === undefined || v === null) return undefined;
    if (!(v >= 0)) throw new Error(`${label}: the price cannot be negative.`);
    return v;
  };
  const one = (yes: boolean, included: boolean | undefined, v: number | undefined, label: string) => ({
    yes,
    included: yes && included === true,
    price: yes && included !== true ? price(v, label) : undefined,
  });
  const count = (n: number | undefined, message: string) => {
    if (!(n !== undefined && Number.isInteger(n) && n >= 1 && n <= 1000)) throw new Error(message);
    return n;
  };
  // delivery and equipment handling as one lump sum: one answer and one price for both
  const lumpSum = a.deliveryEquipmentLumpSum === true;
  const e = one(a.equipmentHandling, a.equipmentHandlingIncluded, lumpSum ? a.lumpSumPrice : a.equipmentHandlingPrice, lumpSum ? "Delivery & equipment handling" : "Equipment handling");
  const s = one(a.staffServing, a.staffServingIncluded, a.staffServingPrice, "Staff serving");
  const staff = s.yes ? count(a.staffServingQuantity, "Staff serving: enter how many staff.") : undefined;
  const t = lumpSum ? e : one(a.transportation, a.transportationIncluded, a.transportationPrice, "Transportation");
  const trips = !lumpSum && t.yes ? count(a.transportationTrips, "Transportation: enter how many trips.") : undefined;
  const d = one(a.domeSet, a.domeSetIncluded, a.domeSetPrice, "Dome set");
  const sets = d.yes ? count(a.domeSetQuantity, "Dome set: enter how many sets.") : undefined;
  return {
    deliveryEquipmentLumpSum: lumpSum,
    lumpSumPrice: lumpSum ? e.price : undefined,
    equipmentHandling: e.yes,
    equipmentHandlingIncluded: e.included,
    equipmentHandlingPrice: lumpSum ? undefined : e.price,
    staffServing: s.yes,
    staffServingIncluded: s.included,
    staffServingQuantity: staff,
    staffServingPrice: s.price,
    transportation: t.yes,
    transportationIncluded: t.included,
    transportationTrips: trips,
    transportationPrice: lumpSum ? undefined : t.price,
    domeSet: d.yes,
    domeSetIncluded: d.included,
    domeSetQuantity: sets,
    domeSetPrice: d.price,
  };
}

export { FORM_REQUIREMENT_FIELDS };
