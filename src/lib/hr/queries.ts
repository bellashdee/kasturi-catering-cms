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
    .select("*, companies(name)")
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
