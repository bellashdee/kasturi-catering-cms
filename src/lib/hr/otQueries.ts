import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { monthDateRange } from "@/lib/finance/constants";
import { countedOtHours } from "@/lib/hr/overtime";

type DB = SupabaseClient<Database>;

/** All OT records (any status) whose OT date falls in the month, for the staff the signed-in user may see. */
export async function listOvertimeForMonth(supabase: DB, companyIds: string[], year: number, month: number) {
  const { start, end } = monthDateRange(year, month);
  const { data, error } = await supabase
    .from("overtime_records")
    .select("*, employees(full_name, department, position, user_id), companies(name)")
    .in("company_id", companyIds)
    .gte("work_date", start)
    .lte("work_date", end)
    .order("work_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getOvertime(supabase: DB, id: string) {
  const { data, error } = await supabase
    .from("overtime_records")
    .select("*, employees(id, full_name, department, position, user_id, company_id), companies(name)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

/** Hours already counted for the staff member in the month of `workDate` (submitted + approved), optionally ignoring one record. */
export async function countedHoursForMonth(supabase: DB, employeeId: string, workDate: string, excludeId?: string): Promise<number> {
  const [year, month] = workDate.split("-").map(Number);
  const { start, end } = monthDateRange(year, month);
  let query = supabase
    .from("overtime_records")
    .select("id, status, hours, approved_hours")
    .eq("employee_id", employeeId)
    .gte("work_date", start)
    .lte("work_date", end);
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).reduce((total, r) => total + countedOtHours(r), 0);
}

/** Audit trail for one OT record, newest first, with the name of whoever did each step. */
export async function listOvertimeAuditLog(supabase: DB, overtimeId: string) {
  const { data, error } = await supabase
    .from("task_audit_log")
    .select("*")
    .eq("related_table", "overtime_records")
    .eq("related_id", overtimeId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const ids = Array.from(new Set((data ?? []).map((r) => r.performed_by).filter((id): id is string => !!id)));
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: people } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    for (const person of people ?? []) names.set(person.id, person.full_name);
  }
  return (data ?? []).map((r) => ({ ...r, performerName: r.performed_by ? names.get(r.performed_by) ?? null : null }));
}
