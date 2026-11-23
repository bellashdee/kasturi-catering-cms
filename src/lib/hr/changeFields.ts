/** The details of a staff record that a staff member may change themselves (every change is written in the edit history with who made it). */
export type ChangeField = { key: string; label: string; source: "employee" | "private"; column: string };

export const CHANGE_FIELDS: ChangeField[] = [
  { key: "full_name", label: "Name", source: "employee", column: "full_name" },
  { key: "ic_passport_no", label: "IC Number / Passport No.", source: "employee", column: "ic_passport_no" },
  { key: "date_of_birth", label: "Date of Birth", source: "employee", column: "date_of_birth" },
  { key: "nationality", label: "Nationality", source: "employee", column: "nationality" },
  { key: "gender", label: "Gender", source: "employee", column: "gender" },
  { key: "race", label: "Race", source: "employee", column: "race" },
  { key: "religion", label: "Religion", source: "employee", column: "religion" },
  { key: "marital_status", label: "Marital Status", source: "employee", column: "marital_status" },
  { key: "phone", label: "Mobile No.", source: "employee", column: "phone" },
  { key: "email", label: "Email", source: "employee", column: "email" },
  { key: "short_name", label: "Short Name", source: "employee", column: "short_name" },
  { key: "bank_name", label: "Bank Name", source: "private", column: "bank_name" },
  { key: "bank_account_no", label: "Bank A/C No.", source: "private", column: "bank_account_no" },
  { key: "epf_no", label: "KWSP No.", source: "private", column: "epf_no" },
];

export const changeFieldByKey = (key: string) => CHANGE_FIELDS.find((f) => f.key === key);

/** Every detail that is written in the edit history (the ones above, and the ones only Madam Penny and Nabilah set). */
export const HISTORY_LABEL: Record<string, string> = {
  ...Object.fromEntries(CHANGE_FIELDS.map((f) => [f.key, f.label])),
  department: "Department",
  position: "Position",
  employment_type: "Employment Type",
  status: "Status",
  join_date: "Start Date",
  branch: "Branch",
  employee_no: "Employee No.",
  old_ic_no: "Old I/C No.",
  passport_no: "Passport No.",
  home_phone: "Phone No.",
  address_line: "Address",
  address_city: "City",
  address_state: "State",
  address_postcode: "Postcode",
  perm_address_line: "Permanent Address",
  perm_city: "Permanent City",
  perm_state: "Permanent State",
  perm_postcode: "Permanent Postcode",
  spouse_name: "Spouse Name",
  spouse_ic_no: "Spouse I/C No.",
  spouse_working: "Spouse Working",
  children_count: "No. of Children",
  child_relief: "Child Relief",
  emergency_name: "Emergency Contact Name",
  emergency_phone: "Emergency Contact Phone",
  emergency_relationship: "Emergency Contact Relationship",
  job_level: "Job Level",
  date_confirmed: "Date Confirmed",
  date_promoted: "Date Promoted",
  resign_date: "Date Resigned",
  education_background: "Education Background",
  working_experience: "Working Experience",
  socso_no: "SOCSO No.",
  tax_no: "Tax No.",
  tax_branch: "Tax Branch",
  bank_id: "Bank ID",
  bank_branch_code: "Bank Branch Code",
  basic_rate: "Basic Rate",
  pay_basis: "Pay Basis",
  payment_mode: "Payment Mode",
};

/** The columns of the staff record that are compared before and after an edit by Madam Penny or Nabilah. */
export const TRACKED_EMPLOYEE_COLUMNS = [
  "full_name", "department", "position", "employment_type", "status", "join_date", "ic_passport_no", "phone", "email", "date_of_birth", "nationality", "gender", "race", "religion", "marital_status", "short_name", "branch",
  "employee_no", "old_ic_no", "passport_no", "home_phone", "address_line", "address_city", "address_state", "address_postcode", "perm_address_line", "perm_city", "perm_state", "perm_postcode",
  "spouse_name", "spouse_ic_no", "spouse_working", "children_count", "child_relief", "emergency_name", "emergency_phone", "emergency_relationship",
  "job_level", "date_confirmed", "date_promoted", "resign_date", "education_background", "working_experience",
] as const;
export const TRACKED_PRIVATE_COLUMNS = ["bank_name", "bank_account_no", "epf_no", "socso_no", "tax_no", "tax_branch", "bank_id", "bank_branch_code", "pay_basis", "payment_mode"] as const;
