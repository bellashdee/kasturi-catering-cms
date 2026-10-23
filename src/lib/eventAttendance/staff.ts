import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { isForeigner } from "@/lib/hr/birthdays";
import type { StaffType } from "@/lib/eventAttendance/rules";

type DB = SupabaseClient<Database>;

export type EventDutyStaff = { id: string; name: string; companyId: string; role: StaffType };

/** The staff who clock in and out of an event: the drivers and the foreign staff (active records of the Staff Database). */
export async function listEventDutyStaff(supabase: DB, companyIds: string[]): Promise<EventDutyStaff[]> {
  if (companyIds.length === 0) return [];
  const [{ data: employees, error }, { data: drivers }] = await Promise.all([
    supabase.from("employees").select("id, full_name, company_id, nationality, ic_passport_no").in("company_id", companyIds).eq("status", "active").order("full_name"),
    supabase.from("driver_profiles").select("employee_id").in("company_id", companyIds),
  ]);
  if (error) throw error;
  const driverIds = new Set((drivers ?? []).map((d) => d.employee_id));
  const out: EventDutyStaff[] = [];
  for (const e of employees ?? []) {
    const role: StaffType | null = driverIds.has(e.id) ? "driver" : isForeigner(e) ? "foreign_staff" : null;
    if (role) out.push({ id: e.id, name: e.full_name, companyId: e.company_id, role });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export const ROLE_LABEL: Record<StaffType, string> = { driver: "Driver", foreign_staff: "Foreign staff" };
