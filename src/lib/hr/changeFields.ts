/** The details of a staff record that a staff member may ask to change. The company sets the rest (position, department, start date, type). */
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

export const CHANGE_STATUS_LABEL: Record<string, string> = { pending: "Waiting for approval", approved: "Approved", rejected: "Rejected" };
