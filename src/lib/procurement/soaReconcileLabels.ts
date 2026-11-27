/** Labels and colours of the SOA reconciliation (shared by the pages and the client components). */
export const RECON_STATUS_LABEL: Record<string, string> = {
  not_reconciled: "Not Reconciled",
  in_progress: "Reconciliation in Progress",
  discrepancy_found: "Discrepancy Found",
  reconciled: "Reconciled",
  approved_for_payment: "Approved for Payment",
  pv_issued: "Payment Voucher Issued",
  paid: "Paid",
  cancelled: "Cancelled",
};

export function reconTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "paid" || status === "reconciled" || status === "approved_for_payment" || status === "pv_issued") return "success";
  if (status === "discrepancy_found") return "danger";
  if (status === "in_progress") return "warning";
  if (status === "cancelled") return "neutral";
  return "info";
}

export function lineTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "matched") return "success";
  if (status === "amount_mismatch" || status === "duplicate") return "danger";
  if (status === "unmatched") return "neutral";
  return "warning";
}

export const LINE_STATUS_LABEL: Record<string, string> = {
  matched: "MATCHED",
  missing_in_ours: "MISSING IN OUR RECORDS",
  missing_in_soa: "MISSING IN SUPPLIER SOA",
  amount_mismatch: "AMOUNT MISMATCH",
  payment_not_reflected: "PAYMENT NOT REFLECTED",
  duplicate: "DUPLICATE",
  unmatched: "UNMATCHED",
};

export const LINE_TYPE_LABEL: Record<string, string> = {
  opening: "Opening balance",
  invoice: "Invoice",
  payment: "Payment",
  credit_note: "Credit note",
  debit_note: "Debit note",
  other: "Other",
};

export const PV_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted for approval",
  approved: "Approved · PV issued",
  rejected: "Rejected",
  paid: "Paid",
  cancelled: "Cancelled",
};
