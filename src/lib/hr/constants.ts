export const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
};

export const EMPLOYEE_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  resigned: "Resigned",
  terminated: "Terminated",
  inactive: "Inactive",
};

export const EMPLOYMENT_STAGE_LABEL: Record<string, string> = {
  probation: "Probation",
  confirmed: "Confirmed",
};

/**
 * What to show as the employment status. People who are still employed keep status "active" in the database
 * (other modules filter on it), so for them the probation / confirmed stage is shown when it is set.
 */
export function employeeStatusLabel(status: string, stage: string | null | undefined): string {
  if (status === "active" && stage) return EMPLOYMENT_STAGE_LABEL[stage] ?? stage;
  return EMPLOYEE_STATUS_LABEL[status] ?? status;
}

export function employeeStatusTone(status: string, stage: string | null | undefined): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "terminated") return "danger";
  if (status === "resigned" || status === "inactive") return "neutral";
  if (stage === "probation") return "warning";
  if (stage === "confirmed") return "info";
  return "success";
}

export const HISTORY_EVENT_LABEL: Record<string, string> = {
  joined: "Joined",
  status_change: "Status change",
  probation_review: "Probation review",
  confirmation: "Confirmed",
  resignation: "Resignation",
  termination: "Termination",
  transfer: "Transfer",
  note: "Note",
};

export const PROBATION_OUTCOME_LABEL: Record<string, string> = {
  pass: "Passed",
  extend: "Extended",
  fail: "Not passed",
};

export const EMPLOYEE_DOC_CATEGORY_LABEL: Record<string, string> = {
  offer_letter: "Offer Letter",
  employment_contract: "Employment Contract",
  confirmation_letter: "Confirmation Letter",
  warning_letter: "Warning Letter",
  resignation_letter: "Resignation Letter",
  other: "Other HR Document",
};

/** Employee HR document uploads: allowed types and size (the storage bucket enforces the same limits). */
export const HR_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const HR_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
export const HR_DOCUMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.docx";
export const EMPLOYEE_PHOTO_MIME_TYPES = ["image/jpeg", "image/png"];
export const EMPLOYEE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;

export const CERT_TYPE_LABEL: Record<string, string> = {
  food_handling: "Food Handling Certificate",
  typhoid: "Typhoid Certificate",
  work_permit: "Work Permit",
  training: "Training",
  medical_certificate: "Medical Certificate (MC)",
  confirmation_letter: "Confirmation Letter",
  loa: "Letter of Appointment (LOA)",
  other: "Other",
};

/** Employee document types that never expire, so no expiry date is asked for. */
export const NO_EXPIRY_CERT_TYPES = ["confirmation_letter", "loa"];

export const COMPANY_DOC_TYPE_LABEL: Record<string, string> = {
  mbjb_licence: "MBJB Licence",
  halal_licence: "Halal Licence",
  tenancy_agreement: "Tenancy Agreement",
  other: "Other",
};

export const LEAVE_TYPE_LABEL: Record<string, string> = {
  annual: "Annual Leave",
  medical: "Medical Leave",
  emergency: "Emergency Leave",
  unpaid: "Unpaid Leave",
  other: "Other",
};

export const LEAVE_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export const ATTENDANCE_STATUS_LABEL: Record<string, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  on_leave: "On Leave",
};

export const PAYROLL_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  paid: "Paid",
};

/** Expiry thresholds, in days, used for the badge shown next to each certificate / licence. */
export function certificateUrgency(expiryDate: string | null): "expired" | "expiring_soon" | "valid" | "no_expiry" {
  if (!expiryDate) return "no_expiry";
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date();
  soon.setDate(soon.getDate() + 30);
  const soonIso = soon.toISOString().slice(0, 10);

  if (expiryDate < today) return "expired";
  if (expiryDate <= soonIso) return "expiring_soon";
  return "valid";
}

/** Bank account and KWSP numbers are only visible to / editable by these roles (also enforced by the database). */
export function canManageStaffPrivateDetails(role: string): boolean {
  return role === "super_admin" || role === "company_admin";
}
