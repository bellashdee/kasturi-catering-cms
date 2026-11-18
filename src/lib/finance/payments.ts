/** Shared rules for Finance payments (supplier, rental, utilities): labels, due-date urgency, account formatting. */

export type PaymentCategory = "supplier" | "rental" | "utility";
export type UtilityType = "electricity_water" | "electricity" | "water" | "indah_water";

export const PAYMENT_CATEGORY_LABEL: Record<PaymentCategory, string> = {
  supplier: "Supplier Payment",
  rental: "Rental Payment",
  utility: "Utilities Payment",
};

export const UTILITY_TYPE_LABEL: Record<UtilityType, string> = {
  electricity_water: "Utility – Electricity & Water",
  electricity: "Utility – Electricity",
  water: "Utility – Water",
  indah_water: "Utility – Indah Water",
};

/** The provider that normally bills each utility type. "Landlord" = electricity & water paid together with the rental account. */
export const UTILITY_PROVIDER_BY_TYPE: Record<UtilityType, string> = {
  electricity_water: "Landlord",
  electricity: "TNB",
  water: "SAJ",
  indah_water: "Indah Water",
};

export const UTILITY_PROVIDERS = ["TNB", "SAJ", "Indah Water", "Landlord"] as const;

/** Rental and utilities are paid by these companies (O2 Life has its own rentals, e.g. its hostels). */
export const RENTAL_UTILITY_COMPANY_NAMES = ["Signature Solution", "O2 Life"] as const;
export const RENTAL_UTILITY_COMPANIES_LABEL = RENTAL_UTILITY_COMPANY_NAMES.join(" and ");
export const isRentalUtilityCompany = (name: string | null | undefined) => !!name && (RENTAL_UTILITY_COMPANY_NAMES as readonly string[]).includes(name);

/** Rental is paid before the 7th of each month unless the agreement or invoice says otherwise. */
export const DEFAULT_RENTAL_DUE_DAY = 7;

/** A payment due within this many days is shown as "Due Soon". */
export const DUE_SOON_DAYS = 3;

export type PaymentUrgency = "paid" | "overdue" | "due_today" | "due_soon" | "pending";

export const URGENCY_LABEL: Record<PaymentUrgency, string> = {
  paid: "Paid",
  overdue: "Overdue",
  due_today: "Due Today",
  due_soon: "Due Soon",
  pending: "Pending Payment",
};

export const URGENCY_REMINDER: Record<PaymentUrgency, string> = {
  paid: "🟢 PAID",
  overdue: "🔴 OVERDUE",
  due_today: "🟠 DUE TODAY",
  due_soon: "🟡 DUE SOON",
  pending: "PENDING",
};

export const URGENCY_TONE: Record<PaymentUrgency, "success" | "warning" | "danger" | "info" | "neutral"> = {
  paid: "success",
  overdue: "danger",
  due_today: "warning",
  due_soon: "warning",
  pending: "neutral",
};

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Overdue / due today / due soon are worked out from the due date and today's date in Malaysia time. */
export function paymentUrgency(status: string, dueDate: string | null, today: string): PaymentUrgency {
  if (status === "paid") return "paid";
  if (!dueDate) return "pending";
  const days = daysBetween(today, dueDate);
  if (days < 0) return "overdue";
  if (days === 0) return "due_today";
  if (days <= DUE_SOON_DAYS) return "due_soon";
  return "pending";
}

/** First day of a month as YYYY-MM-01. */
export function periodStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** The given day of the month (clamped to the month length) as an ISO date. */
export function dueDateFor(year: number, month: number, day: number): string {
  const last = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

export function accountDisplay(accountNo: string | null | undefined): string {
  return accountNo?.trim() ? accountNo : "Not Available";
}

/** Only the last 4 characters, for audit entries (the audit log is visible to more people than bank details are). */
export function maskAccount(accountNo: string | null | undefined): string {
  const value = accountNo?.trim();
  if (!value) return "(none)";
  return value.length <= 4 ? "••••" : `••••${value.slice(-4)}`;
}

export function formatRM(amount: number): string {
  return `RM ${amount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type PaymentLike = { amount: number | string; status: string; due_date: string | null; /** what was paid so far on a payment that is not fully paid (part payments) */ paid_so_far?: number | null };

export type PaymentSummary = {
  count: number;
  total: number;
  paid: number;
  /** Everything not paid yet (pending, due soon, due today and overdue). */
  pending: number;
  overdue: number;
};

export function summarizePayments(rows: PaymentLike[], today: string): PaymentSummary {
  const s: PaymentSummary = { count: rows.length, total: 0, paid: 0, pending: 0, overdue: 0 };
  for (const r of rows) {
    const amount = Number(r.amount);
    s.total += amount;
    if (r.status === "paid") {
      s.paid += amount;
      continue;
    }
    // a part-paid payment counts what was paid as paid and only the balance as still to pay
    const part = Math.min(Math.max(Number(r.paid_so_far ?? 0), 0), amount);
    const left = amount - part;
    s.paid += part;
    s.pending += left;
    if (paymentUrgency(r.status, r.due_date, today) === "overdue") s.overdue += left;
  }
  return s;
}

export const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "unpaid", label: "Unpaid (all)" },
  { value: "pending", label: "Pending Payment" },
  { value: "due_soon", label: "Due Soon" },
  { value: "due_today", label: "Due Today" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
];

export function matchesStatusFilter(urgency: PaymentUrgency, filter: string | undefined): boolean {
  if (!filter) return true;
  if (filter === "unpaid") return urgency !== "paid";
  return urgency === filter;
}

export type Priority = "high" | "medium" | "low";

export const PRIORITY_LABEL: Record<Priority, string> = { high: "High", medium: "Medium", low: "Low" };

/** Checklist score of a payment by priority: High 5, Medium 3, Low 1 (a payment without a priority counts as 1). */
export const PRIORITY_WEIGHT: Record<Priority, number> = { high: 5, medium: 3, low: 1 };

export function priorityWeight(priority: string | null | undefined): number {
  return PRIORITY_WEIGHT[(priority ?? "low") as Priority] ?? 1;
}

export const PRIORITY_TONE: Record<Priority, "danger" | "warning" | "neutral"> = { high: "danger", medium: "warning", low: "neutral" };
