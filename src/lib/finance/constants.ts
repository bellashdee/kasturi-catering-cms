import { todayInMalaysia } from "@/lib/format";

export const PETTY_CASH_TYPE_LABEL: Record<string, string> = {
  top_up: "Top-Up",
  expense: "Expense",
};

export const PETTY_CASH_PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending_payment: "Pending Payment",
  paid: "Paid",
};

/** A pending petty cash claim older than this many days is flagged overdue. */
export const PETTY_CASH_OVERDUE_DAYS = 7;

export function pettyCashDaysPending(claimDate: string): number {
  const claimed = Date.parse(`${claimDate}T00:00:00Z`);
  const now = Date.parse(`${todayInMalaysia()}T00:00:00Z`);
  return Math.max(0, Math.round((now - claimed) / 86_400_000));
}

export function isPettyCashOverdue(claimDate: string, paymentStatus: string): boolean {
  return paymentStatus === "pending_payment" && pettyCashDaysPending(claimDate) > PETTY_CASH_OVERDUE_DAYS;
}

/**
 * A Server Action can only throw plain errors across the client/server
 * boundary (Next.js reconstructs a generic Error, losing any custom class),
 * so duplicate-invoice detection is signaled by this exact message — the
 * form checks for it by substring and asks "save anyway?" instead of
 * silently blocking or silently saving.
 */
export const DUPLICATE_INVOICE_MESSAGE = "DUPLICATE_INVOICE: An invoice with this number already exists for this company.";

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  approved: "Approved",
  issued: "Issued",
  partially_paid: "Partially Paid",
  paid: "Paid",
  overdue: "Overdue",
  disputed: "Disputed",
};

export const MONTH_LABEL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function isOverdue(dueDate: string, status: string): boolean {
  return status !== "paid" && dueDate < todayInMalaysia();
}

export function monthDateRange(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(endDate).padStart(2, "0")}`;
  return { start, end };
}

export type DateRange = { start: string; end: string };

/** A custom "from - to" period typed in a report filter: both dates must be real, and "from" cannot be after "to". */
export function parseDateRange(from: string | undefined, to: string | undefined): DateRange | undefined {
  const valid = (d: string | undefined): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
  if (!valid(from) || !valid(to) || from > to) return undefined;
  return { start: from, end: to };
}

/** The period a report covers: the custom date range when one is given, otherwise the whole chosen month. */
export function resolvePeriod(year: number, month: number, range?: DateRange): DateRange {
  return range ?? monthDateRange(year, month);
}

/** The departments an expense or a budget belongs to, in alphabetical order. */
export const DEPARTMENT_OPTIONS = [
  "ACCOUNTS / FINANCE",
  "ADMIN",
  "KITCHEN / PRODUCTION",
  "LOGISTICS / DELIVERY",
  "MAINTENANCE",
  "OPERATION / EVENT",
  "SALES & MARKETING",
  "SERVICE / BANQUET",
  "STORE / PURCHASING",
] as const;

/** The department choices, plus a department already on the record that is not in the list (for example "Kitchen" from the imported sheets). */
export function departmentChoices(current?: string | null): string[] {
  return current && !(DEPARTMENT_OPTIONS as readonly string[]).includes(current) ? [...DEPARTMENT_OPTIONS, current] : [...DEPARTMENT_OPTIONS];
}
