import { todayInMalaysia } from "@/lib/format";

export const SUPPLIER_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  blacklisted: "Blacklisted",
};

export const PROCUREMENT_REQUEST_STATUS_LABEL: Record<string, string> = {
  pending: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  converted: "Converted to PO",
};

export const PO_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent to Supplier",
  acknowledged: "Acknowledged",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  approved: "Approved",
  paid: "Paid",
  overdue: "Overdue",
  disputed: "Disputed",
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Pending Approval",
  approved: "Approved — Ready to Pay",
  paid: "Paid",
  rejected: "Rejected",
};

export function isOverdue(dueDate: string, status: string): boolean {
  return status !== "paid" && dueDate < todayInMalaysia();
}

