/**
 * The one shape every invoice reader produces, whatever the file format (PDF, scan, photo, WhatsApp screenshot, XML
 * e-invoice, Excel, Word). Values are what is printed on the document: a value that is not printed is null and is flagged
 * for manual review. Nothing here is ever calculated or completed by the reader.
 *
 * Supplier statements (SOA) can reuse the same reader later: they share the header fields and use the lines for the
 * invoices listed on the statement.
 */

export type Confidence = "high" | "medium" | "low";

export const HEADER_FIELDS = [
  "supplier_name",
  "supplier_registration_no",
  "supplier_tax_no",
  "bill_to_name",
  "invoice_number",
  "invoice_date",
  "due_date",
  "po_number",
  "do_number",
  "event_reference",
  "description",
  "currency",
  "payment_terms",
  "subtotal",
  "discount_total",
  "tax_amount",
  "delivery_charge",
  "other_charges",
  "rounding",
  "total_amount",
  "amount_paid",
  "outstanding_amount",
] as const;
export type HeaderField = (typeof HEADER_FIELDS)[number];

export const MONEY_FIELDS: HeaderField[] = [
  "subtotal",
  "discount_total",
  "tax_amount",
  "delivery_charge",
  "other_charges",
  "rounding",
  "total_amount",
  "amount_paid",
  "outstanding_amount",
];
export const DATE_FIELDS: HeaderField[] = ["invoice_date", "due_date"];

/** Fields an invoice cannot be approved without (a missing one is typed in by the reviewer, never filled in by the reader). */
export const REQUIRED_FOR_APPROVAL: HeaderField[] = ["supplier_name", "invoice_number", "invoice_date", "due_date", "total_amount"];

export const FIELD_LABEL: Record<HeaderField, string> = {
  supplier_name: "Supplier",
  supplier_registration_no: "Supplier reg. no.",
  supplier_tax_no: "Supplier SST / TIN no.",
  bill_to_name: "Bill to",
  invoice_number: "Invoice no.",
  invoice_date: "Invoice date",
  due_date: "Due date",
  po_number: "PO no.",
  do_number: "DO no.",
  event_reference: "Event reference",
  description: "Description",
  currency: "Currency",
  payment_terms: "Payment terms",
  subtotal: "Subtotal",
  discount_total: "Discount",
  tax_amount: "SST / tax",
  delivery_charge: "Delivery charge",
  other_charges: "Other charges",
  rounding: "Rounding",
  total_amount: "Grand total",
  amount_paid: "Amount paid",
  outstanding_amount: "Outstanding",
};

/** Standard categories for invoice lines (the kitchen's own ingredient categories plus non-food costs). A suggestion only. */
export const LINE_CATEGORIES = [
  "AYAM",
  "DAGING",
  "IKAN",
  "SEAFOOD",
  "SAYUR",
  "BUAH",
  "BERAS",
  "EGG",
  "FROZEN",
  "GROCERIES",
  "MINUMAN",
  "PACKING",
  "KITCHEN",
  "GAS",
  "TRANSPORT",
  "SERVICES",
  "OTHER",
] as const;

export type InvoiceLine = {
  item_code: string | null;
  /** the description exactly as printed */
  description: string | null;
  /** suggested standard category (not printed; the original description stays as printed) */
  category: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  discount: number | null;
  tax_amount: number | null;
  line_total: number | null;
  /** "Page 2", "Sheet1!C12", "InvoiceLine[3]" */
  source: string | null;
  confidence: Confidence | null;
};

export type InvoiceHeader = Record<HeaderField, string | number | null>;

export type FieldInfo = {
  confidence: Confidence | null;
  status: "found" | "absent" | "unreadable";
  /** the value exactly as printed ("RM 1,234.50", "01/08/2026") */
  printed: string | null;
  source: string | null;
  notes: string[];
};

export type CanonicalInvoice = {
  header: InvoiceHeader;
  lines: InvoiceLine[];
  fields: Partial<Record<HeaderField, FieldInfo>>;
  /** chat text seen around the invoice on a screenshot: kept for reference, never used as invoice values */
  chatText: string | null;
  isChatScreenshot: boolean;
  issues: string[];
};

export function emptyHeader(): InvoiceHeader {
  return Object.fromEntries(HEADER_FIELDS.map((f) => [f, null])) as InvoiceHeader;
}

export function toNumberOrNull(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.trim().replace(/^(rm|myr|usd|sgd|\$)\s*/i, "").replace(/\s/g, "");
  const negative = /^\(.*\)$/.test(s) || /-$/.test(s);
  s = s.replace(/[()]/g, "").replace(/-$/, "");
  s = s.replace(/,(?=\d{3}(\D|$))/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return negative && n > 0 ? -n : n;
}

export function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, mac: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, ogo: 8, ogos: 8, sep: 9, sept: 9, oct: 10, okt: 10, nov: 11, dec: 12, dis: 12,
};
const iso = (y: number, m: number, d: number): string | null => {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const s = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isIsoDate(s) && new Date(s).getUTCDate() === d ? s : null;
};

/**
 * Reads a date exactly as printed, the Malaysian way: 03/11/2026 is 3 November (day first). Returns null when the printed
 * text is not a date this can read with certainty (then the reviewer types it).
 */
export function parsePrintedDate(printed: string | null | undefined): string | null {
  if (!printed) return null;
  const s = printed.trim();
  let m = s.match(/(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    // day first; only a second number over 12 proves the month came first
    return b > 12 && a <= 12 ? iso(+m[3], a, b) : iso(+m[3], b, a);
  }
  const monthOf = (w: string) => MONTHS[w.toLowerCase()] ?? MONTHS[w.toLowerCase().slice(0, 3)];
  m = s.match(/(\d{1,2})(?:st|nd|rd|th)?[\s\-./]*([A-Za-z]{3,9})[\s\-./,]*(\d{2,4})/);
  if (m && monthOf(m[2])) return iso(+m[3], monthOf(m[2]), +m[1]);
  m = s.match(/([A-Za-z]{3,9})[\s\-./]*(\d{1,2})(?:st|nd|rd|th)?[\s,]+(\d{4})/);
  if (m && monthOf(m[1])) return iso(+m[3], monthOf(m[1]), +m[2]);
  return null;
}

export function textOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}
