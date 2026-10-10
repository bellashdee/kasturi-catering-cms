import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

export async function listEmployees(supabase: DB, companyIds: string[], search?: string) {
  let query = supabase
    .from("employees")
    .select("id, full_name, department, position, employment_type, status, join_date, company_id, companies(name)")
    .in("company_id", companyIds)
    .order("full_name", { ascending: true });

  if (search) {
    query = query.ilike("full_name", `%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getEmployee(supabase: DB, employeeId: string) {
  const { data, error } = await supabase
    .from("employees")
    // Columns are named explicitly: the legacy ic_passport_no column must never reach a profile screen.
    .select(
      "id, company_id, full_name, employee_no, department, department_id, position, employment_type, status, employment_stage, join_date, resign_date, probation_start, probation_end, confirmation_date, contract_end, reporting_manager_id, photo_path, phone, email, user_id, companies(name)",
    )
    .eq("id", employeeId)
    .single();
  if (error) throw error;
  return data;
}

export async function listCertificates(supabase: DB, employeeId: string) {
  const { data, error } = await supabase
    .from("employee_certificates")
    .select("*")
    .eq("employee_id", employeeId)
    .order("expiry_date", { ascending: true });
  if (error) throw error;
  return data;
}

export async function listLeaveForEmployee(supabase: DB, employeeId: string) {
  const { data, error } = await supabase
    .from("leave_requests")
    .select("*")
    .eq("employee_id", employeeId)
    .order("start_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listLeaveForCompanies(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("leave_requests")
    .select("*, employees(full_name), companies(name)")
    .in("company_id", companyIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listOvertimeForEmployee(supabase: DB, employeeId: string) {
  const { data, error } = await supabase
    .from("overtime_records")
    .select("*")
    .eq("employee_id", employeeId)
    .order("work_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listOvertimeForCompanies(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("overtime_records")
    .select("*, employees(full_name), companies(name)")
    .in("company_id", companyIds)
    .order("work_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listPayrollForEmployee(supabase: DB, employeeId: string) {
  const { data, error } = await supabase
    .from("payroll_records")
    .select("*")
    .eq("employee_id", employeeId)
    .order("pay_period_start", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listPayrollForCompanies(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("payroll_records")
    .select("*, employees(full_name), companies(name)")
    .in("company_id", companyIds)
    .order("pay_period_start", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listAttendanceForEmployee(supabase: DB, employeeId: string) {
  const { data, error } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("employee_id", employeeId)
    .order("work_date", { ascending: false })
    .limit(30);
  if (error) throw error;
  return data;
}

/**
 * Restricted details (IC/passport, address, emergency contact, bank, KWSP). The database returns the row only
 * to HR Admins and to the employee it belongs to; everyone else gets null.
 */
export async function getEmployeePrivateDetails(supabase: DB, employeeId: string) {
  const { data, error } = await supabase
    .from("employee_private_details")
    .select(
      "bank_name, bank_account_no, epf_no, ic_passport_no, residential_address, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone",
    )
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Employee directory (search, filters, pagination)
// ---------------------------------------------------------------------------

export const EMPLOYEE_PAGE_SIZE = 25;
export const STATUS_FILTERS = ["active", "probation", "confirmed", "resigned", "terminated", "inactive"] as const;
export const TYPE_FILTERS = ["full_time", "part_time", "contract"] as const;

export type EmployeeFilters = {
  q?: string;
  departmentId?: string;
  status?: string;
  type?: string;
  page?: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Removes characters that have a meaning inside a PostgREST filter, so search text can never change the query. */
function safeSearchText(q: string) {
  return q.replace(/[,()%*\\:"']/g, " ").trim().slice(0, 80);
}

export async function searchEmployees(supabase: DB, companyIds: string[], filters: EmployeeFilters) {
  const page = Number.isInteger(filters.page) && (filters.page as number) > 0 ? (filters.page as number) : 1;
  const from = (page - 1) * EMPLOYEE_PAGE_SIZE;

  let query = supabase
    .from("employees")
    .select(
      "id, employee_no, full_name, department, department_id, position, employment_type, status, employment_stage, join_date, company_id, companies(name)",
      { count: "exact" },
    )
    .in("company_id", companyIds)
    .order("full_name", { ascending: true })
    .range(from, from + EMPLOYEE_PAGE_SIZE - 1);

  const text = filters.q ? safeSearchText(filters.q) : "";
  if (text) query = query.or(`full_name.ilike.%${text}%,employee_no.ilike.%${text}%`);

  if (filters.departmentId && UUID_RE.test(filters.departmentId)) query = query.eq("department_id", filters.departmentId);
  if (filters.type && (TYPE_FILTERS as readonly string[]).includes(filters.type)) query = query.eq("employment_type", filters.type);

  switch (filters.status) {
    case "active":
      query = query.eq("status", "active").is("employment_stage", null);
      break;
    case "probation":
    case "confirmed":
      query = query.eq("status", "active").eq("employment_stage", filters.status);
      break;
    case "resigned":
    case "terminated":
    case "inactive":
      query = query.eq("status", filters.status);
      break;
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0, page, pageSize: EMPLOYEE_PAGE_SIZE };
}

/** Every row matching the filters, capped, for CSV export. Directory fields only — never IC, address, bank or salary. */
export async function listEmployeesForExport(supabase: DB, companyIds: string[], filters: EmployeeFilters, cap = 5000) {
  const all: Awaited<ReturnType<typeof searchEmployees>>["rows"] = [];
  let page = 1;
  while (all.length < cap) {
    const result = await searchEmployees(supabase, companyIds, { ...filters, page });
    all.push(...result.rows);
    if (all.length >= result.total || result.rows.length === 0) break;
    page += 1;
  }
  return all.slice(0, cap);
}

export async function listDepartments(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("departments")
    .select("id, company_id, name, is_active")
    .in("company_id", companyIds)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** People who can be picked as a reporting manager: current employees of the same company. */
export async function listManagerCandidates(supabase: DB, companyId: string) {
  const { data, error } = await supabase
    .from("employees")
    .select("id, full_name, position")
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("full_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listEmploymentHistory(supabase: DB, employeeId: string) {
  const { data, error } = await supabase
    .from("employment_history")
    .select("id, event_type, effective_date, from_status, to_status, outcome, details, created_at, recorded_by")
    .eq("employee_id", employeeId)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listEmployeeDocuments(supabase: DB, employeeId: string) {
  const { data, error } = await supabase
    .from("employee_documents")
    .select("id, category, title, original_filename, visible_to_employee, created_at")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Claims paid out of petty cash for this person (the only claims data that exists today). */
export async function listClaimsForEmployee(supabase: DB, employeeId: string) {
  const { data, error } = await supabase
    .from("petty_cash_transactions")
    .select("id, category, description, amount, transaction_date, payment_status")
    .eq("claimant_employee_id", employeeId)
    .order("transaction_date", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

/** Names for the "recorded by" column in employment history. Reads only the display name. */
export async function getProfileNames(supabase: DB, ids: string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return new Map<string, string>();
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", unique);
  return new Map((data ?? []).map((p) => [p.id, p.full_name]));
}
