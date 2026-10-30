import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { DeliveryPerson } from "@/lib/driver/deliveryPersons";

type DB = SupabaseClient<Database>;

export async function listDeliveries(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("deliveries")
    .select("*, catering_events(event_name, location), vehicles(plate_number), employees(full_name), delivery_vendors(name), companies(name)")
    .in("company_id", companyIds)
    .order("scheduled_time", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getDelivery(supabase: DB, id: string) {
  const { data, error } = await supabase
    .from("deliveries")
    .select("*, catering_events(id, event_name, event_date, location), catering_event_days(day_date), vehicles(id, plate_number), employees(id, full_name), delivery_vendors(name), companies(name)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function listDrivers(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("driver_profiles")
    .select("*, employees(full_name, phone, email, status), companies(name)")
    .in("company_id", companyIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getDriver(supabase: DB, id: string) {
  const { data, error } = await supabase
    .from("driver_profiles")
    .select("*, employees(id, full_name, phone, email, status), companies(name)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function listDeliveriesForDriver(supabase: DB, employeeId: string) {
  const { data, error } = await supabase
    .from("deliveries")
    .select("*, catering_events(event_name, location), vehicles(plate_number)")
    .eq("driver_id", employeeId)
    .order("scheduled_time", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data;
}

export async function listVehicles(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("vehicles")
    .select("*, companies(name)")
    .in("company_id", companyIds)
    .order("plate_number");
  if (error) throw error;
  return data;
}

export async function getVehicle(supabase: DB, id: string) {
  const { data, error } = await supabase.from("vehicles").select("*, companies(name)").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function listMaintenanceForVehicle(supabase: DB, vehicleId: string) {
  const { data, error } = await supabase
    .from("vehicle_maintenance_records")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .order("service_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listMaintenanceForCompanies(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("vehicle_maintenance_records")
    .select("*, vehicles(plate_number), companies(name)")
    .in("company_id", companyIds)
    .order("service_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listDriverExpenses(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("driver_expenses")
    .select("*, vehicles(plate_number), claimant:employees!driver_expenses_claimed_by_fkey(full_name), employees!driver_expenses_driver_id_fkey(full_name), deliveries(id), companies(name)")
    .in("company_id", companyIds)
    .order("expense_date", { ascending: false });
  if (error) throw error;
  return data;
}

/** Approved delivery persons for the given companies: internal driver records plus external vendors (e.g. Lalamove). */
export async function listDeliveryPersons(supabase: DB, companyIds: string[]): Promise<DeliveryPerson[]> {
  const [{ data: drivers, error: driversError }, { data: vendors, error: vendorsError }] = await Promise.all([
    supabase.from("driver_profiles").select("employee_id, company_id, employees(full_name, status)").in("company_id", companyIds),
    supabase.from("delivery_vendors").select("id, name, company_id").in("company_id", companyIds).eq("is_active", true),
  ]);
  if (driversError) throw driversError;
  if (vendorsError) throw vendorsError;

  const internal: DeliveryPerson[] = (drivers ?? [])
    .filter((d) => d.employees?.status === "active")
    .map((d) => ({ value: `driver:${d.employee_id}`, label: d.employees?.full_name ?? "", companyId: d.company_id, kind: "driver" as const }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const external: DeliveryPerson[] = (vendors ?? [])
    .map((v) => ({ value: `vendor:${v.id}`, label: v.name, companyId: v.company_id, kind: "vendor" as const }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [...internal, ...external];
}
