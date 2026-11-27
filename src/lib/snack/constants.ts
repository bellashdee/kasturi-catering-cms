/** JDT II Training Snack / Refreshment requests and the JDT II Snack Fund (Signature Solution). */

export const SNACK_STATUS_LABEL: Record<string, string> = {
  new_request: "New Request",
  pending_confirmation: "Pending Confirmation",
  approved: "Approved",
  purchase_in_progress: "Purchase in Progress",
  purchased: "Purchased",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
};
export const SNACK_STATUSES = Object.keys(SNACK_STATUS_LABEL);

export const SNACK_STATUS_TONE: Record<string, "info" | "warning" | "success" | "danger" | "neutral"> = {
  new_request: "warning",
  pending_confirmation: "warning",
  approved: "info",
  purchase_in_progress: "info",
  purchased: "success",
  delivered: "success",
  completed: "neutral",
  cancelled: "danger",
};

/** Requests that still need Purchasing to act (shown as pending actions). */
export const SNACK_OPEN_STATUSES = ["new_request", "pending_confirmation", "approved", "purchase_in_progress", "purchased"];

export const ITEM_STATUS_LABEL: Record<string, string> = {
  pending: "Not yet bought",
  purchased: "Purchased",
  unavailable: "Unavailable",
  substituted: "Substituted",
};

export const PAYMENT_METHODS = ["Cash", "Bank transfer", "Card", "Online banking", "E-wallet", "Petty cash", "Other"];

export const SNACK_FUND_INITIAL = 500;
/** below this balance the fund shows a "running low" alert */
export const SNACK_FUND_LOW = 100;

export type FundStatus = "Not Yet Received" | "Payment Received" | "Available Balance" | "Fully Utilised" | "Additional Allocation Required";

export type FundAllocation = {
  id: string;
  kind: "initial" | "additional";
  amount: number;
  received: boolean;
  received_date: string | null;
  received_reference: string | null;
  approval_status: "pending" | "approved" | "rejected";
  remarks: string | null;
  created_at: string;
  approved_at: string | null;
  verified_at: string | null;
};

export type FundSummary = {
  initial: FundAllocation | null;
  additional: FundAllocation[];
  /** the money actually received and approved */
  received: number;
  /** what the fund is meant to hold (initial + approved additional), received or not */
  allocated: number;
  spent: number;
  balance: number;
  status: FundStatus;
  lastPurchaseDate: string | null;
  alert: string | null;
};

/**
 * The fund: Remaining balance = allocations (the one-time RM500 + any approved additional allocation) − recorded snack expenses.
 * The RM500 counts as received only after the Admin records and verifies the payment.
 */
export function summariseFund(allocations: FundAllocation[], purchases: { total_price: number; purchase_date: string }[]): FundSummary {
  const initial = allocations.find((a) => a.kind === "initial") ?? null;
  const additional = allocations.filter((a) => a.kind === "additional");
  const counted = allocations.filter((a) => a.kind === "initial" || a.approval_status === "approved");
  const allocated = counted.reduce((t, a) => t + Number(a.amount), 0);
  const received = counted.filter((a) => a.received).reduce((t, a) => t + Number(a.amount), 0);
  const spent = Math.round(purchases.reduce((t, p) => t + Number(p.total_price), 0) * 100) / 100;
  const balance = Math.round((allocated - spent) * 100) / 100;
  const lastPurchaseDate = purchases.map((p) => p.purchase_date).sort().at(-1) ?? null;
  let status: FundStatus;
  if (!initial?.received) status = "Not Yet Received";
  else if (balance < 0) status = "Additional Allocation Required";
  else if (balance === 0) status = "Fully Utilised";
  else if (spent === 0) status = "Payment Received";
  else status = "Available Balance";
  let alert: string | null = null;
  if (balance < 0) alert = `Overspent by RM${Math.abs(balance).toFixed(2)}: an additional allocation (approved by Management) is needed.`;
  else if (balance === 0 && spent > 0) alert = "The snack fund is fully used.";
  else if (balance > 0 && balance < SNACK_FUND_LOW && spent > 0) alert = `The snack fund is running low: RM${balance.toFixed(2)} left.`;
  return { initial, additional, received, allocated, spent, balance, status, lastPurchaseDate, alert };
}
