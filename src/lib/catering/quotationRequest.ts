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
  /** The customer's e-mail and company address, and the address of the event venue (all optional). */
  contactEmail?: string;
  companyAddress?: string;
  eventAddress?: string;
  /** Menu and catering requirements written by the sales agent. */
  requirements?: RequestRequirements;
  /** Files already uploaded with requestAttachmentUpload (menu references, floor plans ...). */
  attachments?: RequestAttachment[];
  /** Honeypot: real people leave it empty. */
  website?: string;
};

export const MAX_EXTRA_ITEMS = 30;

/** "Menu and catering requirements" of a request: how many menu options, and what the customer asked for in their own words. */
export type RequestRequirements = {
  menuOptions?: number;
  foodPreferences?: string;
  dietary?: string;
  vegetarian?: string;
  equipment?: string;
  tableChair?: string;
  serving?: string;
};

/** The written requirements, in the order the form and the inbox show them. */
export const REQUIREMENT_FIELDS: { key: Exclude<keyof RequestRequirements, "menuOptions">; label: string; placeholder: string }[] = [
  { key: "foodPreferences", label: "Food preferences", placeholder: "e.g. less spicy, more chicken dishes, local favourites" },
  { key: "dietary", label: "Special dietary requirements", placeholder: "e.g. no seafood, nut allergy, diabetic-friendly" },
  { key: "vegetarian", label: "Vegetarian requirements", placeholder: "e.g. 10 pax vegetarian, 2 pax vegan" },
  { key: "equipment", label: "Equipment requirements", placeholder: "e.g. chafing dishes, PA system, warmers" },
  { key: "tableChair", label: "Table and chair requirements", placeholder: "e.g. 10 round tables, 100 chairs with covers" },
  { key: "serving", label: "Serving requirements", placeholder: "e.g. waiters to serve VIP table, buffet line refill" },
];

/** One file attached to a request: where it was uploaded and what it is. */
export type RequestAttachment = { path: string; name: string; mime?: string; size: number };

export const ATTACHMENT_BUCKET = "quotation-request-files";
export const MAX_ATTACHMENTS = 5;
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "webp", "heic", "doc", "docx", "xls", "xlsx"];
export const ATTACHMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx,image/*,application/pdf";
export const attachmentExtension = (name: string) => (name.split(".").pop() ?? "").toLowerCase();

/**
 * Where a request stands in the Quotation Request Inbox. The quotation and the invoice themselves are made in AutoCount; no status
 * creates an event (a confirmed event comes in through the Excel import or New Event).
 */
export const TRACKING_STATUS_LABEL: Record<string, string> = {
  new_request: "New Request",
  under_review: "Under Review",
  need_more_info: "Need More Information",
  quotation_prepared: "Quotation Prepared in AutoCount",
  sent_to_customer: "Sent to Customer",
  follow_up_required: "Follow-Up Required",
  customer_confirmed: "Customer Confirmed",
  customer_declined: "Customer Declined",
  cancelled: "Cancelled",
};

export const TRACKING_STATUS_TONE: Record<string, "info" | "warning" | "success" | "danger" | "neutral"> = {
  new_request: "info",
  under_review: "info",
  need_more_info: "warning",
  quotation_prepared: "info",
  sent_to_customer: "info",
  follow_up_required: "warning",
  customer_confirmed: "success",
  customer_declined: "danger",
  cancelled: "neutral",
};

/** What Nabilah, Adlan or Ms. Penny keep up to date for a request (dates as YYYY-MM-DD, "" = not set). */
export type TrackingInput = {
  trackingStatus: string;
  autocountQuotationNo: string;
  autocountInvoiceNo: string;
  quotationPreparedOn: string;
  sentToCustomerOn: string;
  customerResponseOn: string;
  followUpOn: string;
  handledBy: string;
};

/** The tick-boxes under "Additional requirement": each one answered Yes becomes a line of the quotation. */
export type AdditionalServices = {
  /** true = yes, false = no, null = not answered yet (the public form requires an answer for each). */
  equipmentHandling: boolean | null;
  /** Optional: the office can price it later. */
  equipmentHandlingPrice?: number;
  staffServing: boolean | null;
  /** How many staff serve (requests sent before it was asked count as 1, with the price for the whole event). */
  staffServingQuantity?: number;
  /** Optional: RM for one staff. */
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
  /**
   * Delivery (transportation) and equipment handling charged together as one lump sum: both have the same answer and
   * the quotation has one line at lumpSumPrice instead of two.
   */
  deliveryEquipmentLumpSum?: boolean;
  lumpSumPrice?: number;
};

export const LUMP_SUM_LABEL = "Delivery & equipment handling (lump sum)";

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
    const delivery = a.deliveryEquipmentLumpSum
      ? [{ label: LUMP_SUM_LABEL, yes: !!a.equipmentHandling, detail: detail(a.equipmentHandling, a.equipmentHandlingIncluded, a.lumpSumPrice) }]
      : [
          { label: "Equipment handling", yes: !!a.equipmentHandling, detail: detail(a.equipmentHandling, a.equipmentHandlingIncluded, a.equipmentHandlingPrice) },
          { label: "Transportation", yes: !!a.transportation, detail: detail(a.transportation, a.transportationIncluded, a.transportationPrice) },
        ];
    return [
      delivery[0],
      {
        label: "Staff serving",
        yes: !!a.staffServing,
        detail: !a.staffServing ? "" : a.staffServingQuantity ? countDetail(a.staffServingQuantity, "staff", "staff", a.staffServingIncluded ? null : a.staffServingPrice) : detail(a.staffServing, a.staffServingIncluded, a.staffServingPrice),
      },
      ...delivery.slice(1),
      { label: "Dome set", yes: !!a.domeSet, detail: a.domeSet ? countDetail(a.domeSetQuantity ?? 1, "set", "sets", a.domeSetIncluded ? null : a.domeSetPrice) : "" },
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
      detail: !r.item
        ? ""
        : r.label === "Dome set"
          ? countDetail(r.item.quantity, "set", "sets", r.item.unitPrice)
          : r.label === "Staff serving" && r.item.quantity > 1
            ? countDetail(r.item.quantity, "staff", "staff", r.item.unitPrice)
            : price(r.item.unitPrice, r.perPax),
    }));
}

/** "3 sets × RM 50.00 per set = RM 150.00", or "3 sets · Included in the food price" (price null). */
function countDetail(n: number, one: string, many: string, pricePerUnit: number | null | undefined): string {
  const count = `${n} ${n === 1 ? one : many}`;
  if (pricePerUnit === null) return `${count} · Included in the food price`;
  return pricePerUnit && pricePerUnit > 0 ? `${count} × RM ${pricePerUnit.toFixed(2)} per ${one} = RM ${(n * pricePerUnit).toFixed(2)}` : count;
}

/** The quotation lines for the ticked additional services. */
export function additionalServiceLines(a: AdditionalServices | undefined): ExtraItem[] {
  if (!a) return [];
  const lines: ExtraItem[] = [];
  // a service that is included in the food price is written on the quotation at RM 0.00, so the customer sees that it is given
  const add = (yes: boolean | null, included: boolean | undefined, name: string, price: number | undefined, quantity = 1) => {
    if (yes) lines.push({ itemName: included ? `${name} (included in the food price)` : name, quantity, unitPrice: included ? 0 : (price ?? 0) });
  };
  if (a.deliveryEquipmentLumpSum) add(a.equipmentHandling, a.equipmentHandlingIncluded, LUMP_SUM_LABEL, a.lumpSumPrice);
  else add(a.equipmentHandling, a.equipmentHandlingIncluded, "Equipment handling", a.equipmentHandlingPrice);
  // staff serving: quantity = number of staff, unit price = price per staff
  add(a.staffServing, a.staffServingIncluded, "Staff serving", a.staffServingPrice, a.staffServingQuantity ?? 1);
  if (!a.deliveryEquipmentLumpSum) add(a.transportation, a.transportationIncluded, "Transportation", a.transportationPrice);
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
