import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { EventDay } from "@/lib/catering/days";

type DB = SupabaseClient<Database>;

export async function listEvents(supabase: DB, companyIds: string[], search?: string) {
  let query = supabase
    .from("catering_events")
    .select("id, event_name, event_date, end_date, event_time, pax_count, event_type, status, total_amount, company_id, customers(name), companies(name)")
    .in("company_id", companyIds)
    .order("event_date", { ascending: false });

  if (search) query = query.ilike("event_name", `%${search}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getEvent(supabase: DB, eventId: string) {
  const { data, error } = await supabase
    .from("catering_events")
    .select("*, customers(id, name, phone, email), companies(name)")
    .eq("id", eventId)
    .single();
  if (error) throw error;
  return data;
}

export async function listEventDays(supabase: DB, eventId: string) {
  const { data, error } = await supabase
    .from("catering_event_days")
    .select("*")
    .eq("catering_event_id", eventId)
    .order("day_date");
  if (error) throw error;
  return data;
}

/** The saved days of an event, shaped the way the event form and the quotation seed expect them. */
export function toEventDays(rows: Awaited<ReturnType<typeof listEventDays>>): EventDay[] {
  return rows.map((d) => ({
    dayDate: d.day_date,
    setupTime: d.setup_time?.slice(0, 5) ?? "",
    eventTime: d.event_time?.slice(0, 5) ?? "",
    mealTypes: d.meal_types ?? [],
    serviceType: d.service_type,
    servicePax: d.service_pax,
    secondServiceType: d.second_service_type ?? "",
    secondServicePax: d.second_service_pax ?? undefined,
    menuDetails: d.menu_details ?? "",
    pricePerPax: d.price_per_pax !== null ? Number(d.price_per_pax) : undefined,
    remarks: d.remarks ?? "",
  }));
}

export async function listQuotationsForEvent(supabase: DB, eventId: string) {
  const { data, error } = await supabase
    .from("quotations")
    .select("*, quotation_items(*)")
    .eq("catering_event_id", eventId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getQuotation(supabase: DB, quotationId: string) {
  const { data, error } = await supabase
    .from("quotations")
    .select("*, quotation_items(*), catering_events(event_name, company_id)")
    .eq("id", quotationId)
    .single();
  if (error) throw error;
  return data;
}

export async function listQuotationsForCompanies(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("quotations")
    .select("*, catering_events(event_name, event_date), companies(name)")
    .in("company_id", companyIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getCosting(supabase: DB, eventId: string) {
  const { data, error } = await supabase
    .from("event_costing")
    .select("*")
    .eq("catering_event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listStaffForEvent(supabase: DB, eventId: string) {
  const { data, error } = await supabase
    .from("event_staff")
    .select("*, employees(full_name, position)")
    .eq("catering_event_id", eventId);
  if (error) throw error;
  return data;
}

export async function listEquipmentForEvent(supabase: DB, eventId: string) {
  const { data, error } = await supabase
    .from("event_equipment")
    .select("*, equipment(name, unit, total_quantity)")
    .eq("catering_event_id", eventId);
  if (error) throw error;
  return data;
}

export async function listEquipmentForCompanies(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("equipment")
    .select("*")
    .in("company_id", companyIds)
    .order("name");
  if (error) throw error;
  return data;
}

/** Every delivery of an event: one for a single-day event, one per day for a multi-day event. */
export async function listDeliveriesForEvent(supabase: DB, eventId: string) {
  const { data, error } = await supabase
    .from("deliveries")
    .select("*, vehicles(plate_number), employees(full_name)")
    .eq("catering_event_id", eventId)
    .order("scheduled_time")
    .order("created_at");
  if (error) throw error;
  return data;
}

export async function listCustomersWithHistory(supabase: DB, companyIds: string[], search?: string) {
  let query = supabase
    .from("customers")
    .select("*, companies(name)")
    .in("company_id", companyIds)
    .order("name");

  if (search) query = query.ilike("name", `%${search}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getCustomerWithEvents(supabase: DB, customerId: string) {
  const [{ data: customer, error: customerError }, { data: events, error: eventsError }] = await Promise.all([
    supabase.from("customers").select("*, companies(name)").eq("id", customerId).single(),
    supabase
      .from("catering_events")
      .select("id, event_name, event_date, status, total_amount, pax_count")
      .eq("customer_id", customerId)
      .order("event_date", { ascending: false }),
  ]);
  if (customerError) throw customerError;
  if (eventsError) throw eventsError;
  return { customer, events: events ?? [] };
}
