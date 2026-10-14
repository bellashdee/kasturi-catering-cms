import { addDaysToDateIso } from "@/lib/format";

/** Used when a customer has no payment terms on file (or they cannot be read): the due date is this many days after the invoice date. */
export const DEFAULT_PAYMENT_TERM_DAYS = 14;

/**
 * Reads a payment term typed as free text ("Net 30", "30 days", "COD", "2 weeks", "1 month", "30") into a number of days.
 * Returns null when it is empty or not understood, so the caller can fall back to the default instead of guessing.
 */
export function paymentTermDays(terms: string | null | undefined): number | null {
  const t = terms?.trim().toLowerCase();
  if (!t) return null;
  if (/^(c\.?o\.?d|cash|cash on delivery|on delivery|immediate|upon receipt|due on receipt|advance|prepaid)\b/.test(t)) return 0;
  const m = t.match(/(\d{1,3})\s*(day|days|d|week|weeks|wk|wks|month|months|mth|mths)?\b/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] ?? "day";
  if (unit.startsWith("w")) return n * 7;
  if (unit.startsWith("m")) return n * 30;
  return n;
}

/** The invoice due date: the invoice date plus the customer's payment term (or the default when there is none). */
export function dueDateFromTerms(invoiceDate: string, terms: string | null | undefined): string {
  return addDaysToDateIso(invoiceDate, paymentTermDays(terms) ?? DEFAULT_PAYMENT_TERM_DAYS);
}
