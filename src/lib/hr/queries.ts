import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

export async function listEmployees(supabase: DB, companyIds: string[], search?: string) {
  let query = supabase
    .from("employees")
    .select("id, full_name, department, position, employment_type, status, join_date, company_id, employee_no, ic_passport_no, date_of_birth, gender, nationality, race, religion, marital_status, phone, email, branch, address_line, address_city, address_state, address_postcode, companies(name)")
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
    .select("*, companies(name)")
    .eq("id", employeeId)
    .single();
  if (error) throw error;
  return data;
}

export type EmployeeWithCompany = Awaited<ReturnType<typeof getEmployee>>;

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

/** Returns null for anyone who isn't a Super Admin / Company Admin — the database hides the row from them. */
export async function getEmployeePrivateDetails(supabase: DB, employeeId: string) {
  const { data, error } = await supabase
    .from("employee_private_details")
    .select("bank_name, bank_account_no, epf_no, socso_no, tax_no, tax_branch, bank_id, bank_branch_code, basic_rate, pay_basis, payment_mode")
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
