import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

export async function listAttendance(
  supabase: DB,
  companyIds: string[],
  filters?: { driverName?: string; date?: string; dateFrom?: string; dateTo?: string },
) {
  let query = supabase
    .from("driver_attendance")
    .select("*, companies(name)")
    .in("company_id", companyIds)
    .order("attendance_date", { ascending: false });

  if (filters?.driverName) query = query.ilike("driver_name", `%${filters.driverName}%`);
  if (filters?.date) query = query.eq("attendance_date", filters.date);
  if (filters?.dateFrom) query = query.gte("attendance_date", filters.dateFrom);
  if (filters?.dateTo) query = query.lte("attendance_date", filters.dateTo);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function listActiveDriversForCompanies(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("driver_profiles")
    .select("id, employee_id, user_id, expected_clock_in_time, company_id, employees(full_name, status, user_id), companies(name)")
    .in("company_id", companyIds);
  if (error) throw error;
  return (data ?? []).filter((d) => d.employees?.status === "active");
}
