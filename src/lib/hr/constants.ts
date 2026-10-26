import { addDaysToDateIso, todayInMalaysia } from "@/lib/format";

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
  annual: "Annual Leave (AL) – Cuti Tahunan",
  medical: "Medical Leave (MC) – Cuti Sakit",
  emergency: "Emergency Leave (EL) – Cuti Kecemasan",
  unpaid: "Unpaid Leave (UPL) – Cuti Tanpa Gaji",
  hospitalisation: "Hospitalisation Leave (HL) – Cuti Hospitalisasi",
  replacement: "Replacement Leave (RL) – Cuti Gantian",
  maternity: "Maternity Leave (ML) – Cuti Bersalin",
  bereavement: "Bereavement Leave (BL) – Cuti Kematian",
  marriage: "Marriage Leave (MRL) – Cuti Perkahwinan",
  other: "Other: Nyatakan",
};

/** The leave type as shown in a list: for "Other" the person's own words are added. */
export const leaveTypeText = (type: string, other?: string | null) => (type === "other" && other?.trim() ? `Other: ${other.trim()}` : (LEAVE_TYPE_LABEL[type] ?? type));

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
  const today = todayInMalaysia();
  const soonIso = addDaysToDateIso(today, 30);

  if (expiryDate < today) return "expired";
  if (expiryDate <= soonIso) return "expiring_soon";
  return "valid";
}

/** Bank account and KWSP numbers are only visible to / editable by these roles (also enforced by the database). */
export function canManageStaffPrivateDetails(role: string): boolean {
  return role === "super_admin" || role === "company_admin";
}

