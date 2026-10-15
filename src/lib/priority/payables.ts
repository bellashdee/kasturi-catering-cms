/**
 * The rules of Madam Penny's Priority Centre for supplier payments, as plain functions (no database): what is still
 * owed, which status and priority a payable has, and in which order the list is shown. Every figure is worked out from
 * real records only: an unverified or incomplete record is labelled "Data Required" / "Pending Verification" and is never
 * treated as a confirmed amount, and only confirmed (paid) ledger entries reduce an outstanding balance.
 */

export type PayableType = "finance_payment" | "supplier_invoice";
export type PriorityLevel = "urgent" | "high" | "medium" | "low";
export type LedgerStatus = "pending" | "approved" | "processing" | "paid" | "rejected";

export const PRIORITY_LABEL: Record<PriorityLevel, string> = { urgent: "URGENT", high: "HIGH", medium: "MEDIUM", low: "LOW" };
export const PRIORITY_RANK: Record<PriorityLevel, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
export const PRIORITY_TONE: Record<PriorityLevel, "danger" | "warning" | "info" | "neutral"> = { urgent: "danger", high: "warning", medium: "info", low: "neutral" };

export type PaymentStatusKey = "unpaid" | "partially_paid" | "pending_approval" | "approved" | "processing" | "paid" | "overdue" | "on_hold";

export const PAYMENT_STATUS_LABEL: Record<PaymentStatusKey, string> = {
  unpaid: "Unpaid",
  partially_paid: "Partially Paid",
  pending_approval: "Pending Approval",
  approved: "Approved for Payment",
  processing: "Payment Processing",
  paid: "Paid",
  overdue: "Overdue",
  on_hold: "Disputed / On Hold",
};

export const PAYMENT_STATUS_TONE: Record<PaymentStatusKey, "success" | "warning" | "danger" | "info" | "neutral"> = {
  unpaid: "neutral",
  partially_paid: "info",
  pending_approval: "warning",
  approved: "info",
  processing: "info",
  paid: "success",
  overdue: "danger",
  on_hold: "warning",
};

export type ApprovalKey = "not_requested" | "pending" | "approved" | "rejected";

export const APPROVAL_LABEL: Record<ApprovalKey, string> = {
  not_requested: "No request yet",
  pending: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
};

export const APPROVAL_TONE: Record<ApprovalKey, "success" | "warning" | "danger" | "neutral"> = {
  not_requested: "neutral",
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

export type OpsAlertType = "supplier_blocked" | "refuses_orders" | "event_affected";

export const OPS_ALERT_LABEL: Record<OpsAlertType, string> = {
  supplier_blocked: "Supplier account blocked due to outstanding payment",
  refuses_orders: "Supplier refuses new orders until payment is received",
  event_affected: "Upcoming event may be affected by unavailable ingredients",
};

/** A payable (something owed to a supplier) as read from either source table. */
export type RawPayable = {
  type: PayableType;
  id: string;
  companyId: string;
  companyName: string;
  supplierName: string;
  /** Invoice number / reference, or null when the record has none (shown as "Data Required"). */
  reference: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  amount: number;
  /** The source record itself says it is settled (Finance "paid" / invoice "paid"). */
  settled: boolean;
  /** The source record is being processed (Finance "in progress"). */
  inProgress: boolean;
  /** The source record says disputed (invoice status). */
  disputed: boolean;
  remarks: string | null;
  documents: { id: string; label: string }[];
};

export type LedgerEntry = {
  id: string;
  status: LedgerStatus;
  amount: number;
  paymentDate: string | null;
  referenceNumber: string | null;
  createdAt: string;
  requestedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  /** The note written when the request was made. */
  notes: string | null;
  receiptDocumentId: string | null;
};

export type Control = {
  isUrgent: boolean;
  urgentReason: string | null;
  priorityOverride: PriorityLevel | null;
  overrideReason: string | null;
  holdStatus: "on_hold" | "disputed" | null;
  holdReason: string | null;
  verifiedAmount: number | null;
  verifiedAt: string | null;
  opsAlertType: OpsAlertType | null;
  opsAlertNote: string | null;
  opsAlertEventId: string | null;
  opsAlertAt: string | null;
  notes: string | null;
};

export type Verification = "verified" | "unverified" | "changed";

export type PayableView = RawPayable & {
  paidAmount: number;
  outstanding: number;
  /** Requested but not yet paid (pending, approved or processing). */
  inRequest: number;
  verification: Verification;
  statusKey: PaymentStatusKey;
  approval: ApprovalKey;
  priority: PriorityLevel | null;
  computedPriority: PriorityLevel | null;
  priorityReason: string;
  /** Days until the due date (negative = overdue); null when there is no due date. */
  daysLeft: number | null;
  control: Control | null;
  ledger: LedgerEntry[];
  openRequests: LedgerEntry[];
  /** What a payment request may still ask for: the verified outstanding minus requests already open. */
  requestable: number;
};

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

/** URGENT / HIGH / MEDIUM / LOW from the rules; null means nothing is owed. */
export function computePriority(input: { outstanding: number; daysLeft: number | null; isUrgent: boolean; opsAlert: boolean }): { level: PriorityLevel | null; reason: string } {
  if (input.outstanding <= 0) return { level: null, reason: "Paid" };
  if (input.daysLeft !== null && input.daysLeft < 0) return { level: "urgent", reason: `Overdue by ${-input.daysLeft} day(s)` };
  if (input.opsAlert) return { level: "urgent", reason: "Supplier payment block affecting operations" };
  if (input.isUrgent) return { level: "urgent", reason: "Marked urgent" };
  if (input.daysLeft === null) return { level: "low", reason: "No due date recorded" };
  if (input.daysLeft <= 3) return { level: "high", reason: input.daysLeft === 0 ? "Due today" : `Due in ${input.daysLeft} day(s)` };
  if (input.daysLeft <= 7) return { level: "medium", reason: `Due in ${input.daysLeft} day(s)` };
  return { level: "low", reason: `Due in ${input.daysLeft} day(s)` };
}

export function computePayable(raw: RawPayable, ledger: LedgerEntry[], control: Control | null, today: string): PayableView {
  const paidLedger = round2(ledger.filter((l) => l.status === "paid").reduce((t, l) => t + l.amount, 0));
  const paidAmount = raw.settled ? raw.amount : Math.min(paidLedger, raw.amount);
  const outstanding = raw.settled ? 0 : round2(Math.max(raw.amount - paidAmount, 0));
  const openRequests = ledger.filter((l) => l.status === "pending" || l.status === "approved" || l.status === "processing");
  const inRequest = round2(openRequests.reduce((t, l) => t + l.amount, 0));

  const verification: Verification =
    !control?.verifiedAt ? "unverified" : control.verifiedAmount !== null && Math.abs(control.verifiedAmount - raw.amount) < 0.005 ? "verified" : "changed";

  const daysLeft = raw.dueDate ? daysBetween(today, raw.dueDate) : null;
  const holdStatus = control?.holdStatus ?? (raw.disputed ? "disputed" : null);

  const lastDecision = [...ledger].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const approval: ApprovalKey = openRequests.some((l) => l.status === "pending")
    ? "pending"
    : openRequests.some((l) => l.status === "approved" || l.status === "processing")
      ? "approved"
      : lastDecision?.status === "rejected" && outstanding > 0
        ? "rejected"
        : "not_requested";

  let statusKey: PaymentStatusKey;
  if (outstanding <= 0) statusKey = "paid";
  else if (holdStatus) statusKey = "on_hold";
  else if (openRequests.some((l) => l.status === "processing") || raw.inProgress) statusKey = "processing";
  else if (approval === "approved") statusKey = "approved";
  else if (approval === "pending") statusKey = "pending_approval";
  else if (daysLeft !== null && daysLeft < 0) statusKey = "overdue";
  else if (paidAmount > 0) statusKey = "partially_paid";
  else statusKey = "unpaid";

  const { level: computed, reason } = computePriority({ outstanding, daysLeft, isUrgent: !!control?.isUrgent, opsAlert: !!control?.opsAlertType });
  const override = outstanding > 0 && control?.priorityOverride && control.overrideReason ? control.priorityOverride : null;
  const priority = override ?? computed;

  return {
    ...raw,
    paidAmount,
    outstanding,
    inRequest,
    verification,
    statusKey,
    approval,
    priority,
    computedPriority: computed,
    priorityReason: override ? `Set manually: ${control?.overrideReason}` : reason,
    daysLeft,
    control,
    ledger,
    openRequests,
    requestable: verification === "verified" && !holdStatus ? round2(Math.max(outstanding - inRequest, 0)) : 0,
  };
}

/** Priority first, then the earliest due date (no due date last), then the larger amount. */
export function sortPayables<T extends Pick<PayableView, "priority" | "dueDate" | "outstanding" | "supplierName">>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ra = a.priority ? PRIORITY_RANK[a.priority] : 9;
    const rb = b.priority ? PRIORITY_RANK[b.priority] : 9;
    if (ra !== rb) return ra - rb;
    if (a.dueDate !== b.dueDate) return !a.dueDate ? 1 : !b.dueDate ? -1 : a.dueDate.localeCompare(b.dueDate);
    if (b.outstanding !== a.outstanding) return b.outstanding - a.outstanding;
    return a.supplierName.localeCompare(b.supplierName);
  });
}

export type PayableSummary = {
  urgentCount: number;
  confirmedOutstanding: number;
  confirmedCount: number;
  pendingVerification: number;
  pendingVerificationCount: number;
  onHold: number;
  onHoldCount: number;
  awaitingApprovalCount: number;
  awaitingApprovalAmount: number;
};

/**
 * Summary figures. "Confirmed outstanding" counts only verified balances that are not disputed or on hold: an unverified
 * balance is reported separately as "pending verification", never as confirmed.
 */
export function summarisePayables(rows: PayableView[]): PayableSummary {
  const s: PayableSummary = { urgentCount: 0, confirmedOutstanding: 0, confirmedCount: 0, pendingVerification: 0, pendingVerificationCount: 0, onHold: 0, onHoldCount: 0, awaitingApprovalCount: 0, awaitingApprovalAmount: 0 };
  for (const r of rows) {
    if (r.outstanding <= 0) continue;
    if (r.priority === "urgent") s.urgentCount += 1;
    if (r.statusKey === "on_hold") {
      s.onHold += r.outstanding;
      s.onHoldCount += 1;
    } else if (r.verification === "verified") {
      s.confirmedOutstanding += r.outstanding;
      s.confirmedCount += 1;
    } else {
      s.pendingVerification += r.outstanding;
      s.pendingVerificationCount += 1;
    }
    for (const l of r.openRequests) {
      if (l.status === "pending") {
        s.awaitingApprovalCount += 1;
        s.awaitingApprovalAmount += l.amount;
      }
    }
  }
  s.confirmedOutstanding = round2(s.confirmedOutstanding);
  s.pendingVerification = round2(s.pendingVerification);
  s.onHold = round2(s.onHold);
  s.awaitingApprovalAmount = round2(s.awaitingApprovalAmount);
  return s;
}

export type PayableFilters = {
  company?: string;
  supplier?: string;
  priority?: string;
  status?: string;
  approval?: string;
  dueFrom?: string;
  dueTo?: string;
  /** Show paid items as well (hidden by default: the list is about what is still owed). */
  includePaid?: boolean;
};

export function filterPayables(rows: PayableView[], f: PayableFilters): PayableView[] {
  const supplier = f.supplier?.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.company && r.companyId !== f.company) return false;
    if (supplier && !r.supplierName.toLowerCase().includes(supplier)) return false;
    if (f.priority && r.priority !== f.priority) return false;
    if (f.status) {
      // pending / approved also match the approval stage so "Pending Approval" finds a payable that is also overdue
      const match = f.status === "pending_approval" ? r.approval === "pending" : f.status === "approved" ? r.approval === "approved" : r.statusKey === f.status;
      if (!match) return false;
    } else if (r.statusKey === "paid" && !f.includePaid) return false;
    if (f.approval && r.approval !== f.approval) return false;
    if (f.dueFrom && (!r.dueDate || r.dueDate < f.dueFrom)) return false;
    if (f.dueTo && (!r.dueDate || r.dueDate > f.dueTo)) return false;
    return true;
  });
}
