/**
 * What a customer still owes on an invoice, worked out the one way for every report (Performance Dashboard, Customer Outstanding Report,
 * Company Summary) so their totals tally: the invoice total with tax, less the payments received on it. Paid invoices, drafts and
 * quotation requests waiting for review (not issued yet) are not counted.
 */
export const NOT_OWED_STATUSES = ["paid", "draft", "pending_review"];

/** An invoice that has been issued and not settled. */
export const isOpenInvoice = (status: string) => !NOT_OWED_STATUSES.includes(status);

type InvoiceMoney = { amount: number | string; tax_amount?: number | string | null; customer_payments?: { amount: number | string }[] | null };

export const invoiceTotal = (i: InvoiceMoney) => Number(i.amount) + Number(i.tax_amount ?? 0);
export const invoicePaid = (i: InvoiceMoney) => (i.customer_payments ?? []).reduce((t, p) => t + Number(p.amount), 0);
/** The balance still to be paid (never below 0). */
export const invoiceBalance = (i: InvoiceMoney) => Math.max(0, Math.round((invoiceTotal(i) - invoicePaid(i)) * 100) / 100);

/** Whole days between a due date and today (YYYY-MM-DD); more than 0 = overdue by that many days. */
export function daysOverdue(dueDate: string, today: string): number {
  return Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86_400_000);
}
