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
  const claimed = new Date(`${claimDate}T00:00:00`);
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - claimed.getTime()) / 86_400_000));
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
  return status !== "paid" && dueDate < new Date().toISOString().slice(0, 10);
}

export function monthDateRange(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(endDate).padStart(2, "0")}`;
  return { start, end };
}
