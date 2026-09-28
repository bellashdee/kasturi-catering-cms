export const PETTY_CASH_TYPE_LABEL: Record<string, string> = {
  top_up: "Top-Up",
  expense: "Expense",
};

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  approved: "Approved",
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
