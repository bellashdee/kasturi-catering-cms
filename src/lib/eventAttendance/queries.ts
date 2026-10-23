import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

export async function listEventAttendance(supabase: DB, companyIds: string[], filters: { date?: string; name?: string }) {
  let query = supabase
    .from("event_attendance")
    .select("*, companies(name), event_sites(source)")
    .in("company_id", companyIds)
    .order("attendance_date", { ascending: false })
    .order("clock_in_time", { ascending: false })
    .limit(500);
  if (filters.date) query = query.eq("attendance_date", filters.date);
  if (filters.name) query = query.ilike("person_name", `%${filters.name.replace(/[\%_]/g, "\$&")}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function listEventSites(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase.from("event_sites").select("*, companies(name)").in("company_id", companyIds).order("updated_at", { ascending: false }).limit(200);
  if (error) throw error;
  return data;
}

/** Event names and places of the last and the next few days, offered as suggestions on the form inside the system. */
export async function listEventSuggestions(supabase: DB, companyIds: string[], today: string) {
  const day = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const { data } = await supabase.from("catering_events").select("event_name, location, company_id").in("company_id", companyIds).gte("event_date", day(-1)).lte("event_date", day(7)).neq("status", "cancelled").order("event_date");
  return (data ?? []).filter((e) => e.location).map((e) => ({ name: e.event_name, location: e.location as string, companyId: e.company_id }));
}
