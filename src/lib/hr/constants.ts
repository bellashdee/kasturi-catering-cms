export const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
};

export const EMPLOYEE_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  resigned: "Resigned",
  terminated: "Terminated",
};

export const CERT_TYPE_LABEL: Record<string, string> = {
  food_handling: "Food Handling Certificate",
  typhoid: "Typhoid Certificate",
  work_permit: "Work Permit",
  training: "Training",
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

/** Certificate expiry thresholds, in days, used for the badge shown next to each cert. */
export function certificateUrgency(expiryDate: string): "expired" | "expiring_soon" | "valid" {
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date();
  soon.setDate(soon.getDate() + 30);
  const soonIso = soon.toISOString().slice(0, 10);

  if (expiryDate < today) return "expired";
  if (expiryDate <= soonIso) return "expiring_soon";
  return "valid";
}
