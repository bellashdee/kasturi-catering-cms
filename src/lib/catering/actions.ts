"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertValidAssignee } from "@/lib/driver/assignee";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import { SALES_AGENTS } from "@/lib/catering/constants";
import { todayInMalaysia } from "@/lib/format";
import { recordAudit } from "@/lib/audit";
import { dueDateFromTerms } from "@/lib/finance/terms";
import { dayPax, normalizeMenu, type EventDay } from "@/lib/catering/days";
import { validateDays, validateServiceDetails, validateTimes } from "@/lib/catering/validation";
import { runAction, type ActionResult } from "@/lib/actionResult";

type EventStatus = Database["public"]["Enums"]["event_status"];

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

export type EventInput = {
  companyId: string;
  customerId?: string;
  eventName: string;
  eventDate: string;
  eventTime?: string;
  location?: string;
  paxCount?: number;
  eventType: string;
  packageMenuId?: string;
  menuDescription?: string;
  specialRequirements?: string;
  /** Breakfast / lunch / hi-tea / dinner (one or more). */
  mealTypes?: string[];
  /** The first service type is required; the second is optional. */
  serviceType?: string;
  /** How many guests get the first service type. */
  servicePax?: number;
  secondServiceType?: string;
  /** How many guests get the second service type. */
  secondServicePax?: number;
  eventDetails?: string;
  remarks?: string;
  setupTime?: string;
  picName?: string;
  picPhone?: string;
  salesAgent?: string;
  kitchenSetup?: string;
  cateringSetup?: string;
  /** Price per pax for a single-day event (a multi-day event has a price on each day). */
  pricePerPax?: number;
  /**
   * A multi-day event (e.g. 3-5 days): one row per day. When there are days, the event's own date, end date, time,
   * set-up time and pax are worked out from them, and the event-level meal/service/price fields are left empty.
   */
  days?: EventDay[];
  status: string;
  totalAmount?: number;
};

function validateContact(input: Partial<EventInput>) {
  if (input.salesAgent && !SALES_AGENTS.includes(input.salesAgent)) throw new Error("Select a sales agent from the list.");
  if (input.pricePerPax !== undefined && !(input.pricePerPax >= 0)) throw new Error("The price per pax cannot be negative.");
}

const clean = (s: string | undefined) => s?.trim() || null;

function contactColumns(input: Partial<EventInput>) {
  return {
    setup_time: input.setupTime || null,
    pic_name: clean(input.picName),
    pic_phone: clean(input.picPhone),
    sales_agent: input.salesAgent || null,
    kitchen_setup: clean(input.kitchenSetup),
    catering_setup: clean(input.cateringSetup),
  };
}

function singleDayColumns(input: Partial<EventInput>) {
  return {
    meal_types: input.mealTypes ?? [],
    service_type: input.serviceType || null,
    service_pax: input.serviceType ? input.servicePax ?? null : null,
    second_service_type: input.secondServiceType || null,
    second_service_pax: input.secondServiceType ? input.secondServicePax ?? null : null,
    event_details: input.eventDetails?.trim() || null,
    remarks: input.remarks?.trim() || null,
    price_per_pax: input.pricePerPax ?? null,
  };
}

/**
 * What the event row stores. For a multi-day event the dates, times and pax come from the days (first day = start,
 * last day = end, biggest day = pax) and the meal/service/price columns stay empty because each day holds its own.
 */
function eventColumns(input: EventInput) {
  const days = [...(input.days ?? [])].sort((a, b) => a.dayDate.localeCompare(b.dayDate));
  if (days.length === 0) {
    return {
      event_date: input.eventDate,
      end_date: null,
      event_time: input.eventTime || null,
      pax_count: input.paxCount ?? null,
      ...contactColumns(input),
      ...singleDayColumns(input),
    };
  }
  const first = days[0];
  const last = days[days.length - 1];
  return {
    event_date: first.dayDate,
    end_date: last.dayDate !== first.dayDate ? last.dayDate : null,
    event_time: first.eventTime || null,
    pax_count: Math.max(...days.map(dayPax)),
    ...contactColumns({ ...input, setupTime: first.setupTime }),
    ...singleDayColumns({ eventDetails: input.eventDetails, remarks: input.remarks }),
  };
}

function dayRows(companyId: string, eventId: string, input: EventInput) {
  const days = [...(input.days ?? [])].sort((a, b) => a.dayDate.localeCompare(b.dayDate));
  return days.map((d, i) => ({
    company_id: companyId,
    catering_event_id: eventId,
    day_date: d.dayDate,
    setup_time: d.setupTime || null,
    event_time: d.eventTime || null,
    meal_types: d.mealTypes ?? [],
    service_type: d.serviceType,
    service_pax: d.servicePax as number,
    second_service_type: d.secondServiceType || null,
    second_service_pax: d.secondServiceType ? d.secondServicePax ?? null : null,
    menu_details: clean(normalizeMenu(d.menuDetails)),
    price_per_pax: d.pricePerPax ?? null,
    remarks: clean(d.remarks),
    sort_order: i,
  }));
}

function validateEvent(input: EventInput) {
  validateContact(input);
  if ((input.days?.length ?? 0) > 0) validateDays(input.days ?? []);
  else {
    validateTimes(input);
    validateServiceDetails(input, true);
  }
}

export async function createEvent(input: EventInput) {
  const { supabase } = await requireUser();
  validateEvent(input);
  const { data, error } = await supabase
    .from("catering_events")
    .insert({
      company_id: input.companyId,
      customer_id: input.customerId || null,
      event_name: input.eventName,
      location: input.location || null,
      event_type: input.eventType,
      package_menu_id: input.packageMenuId || null,
      menu_description: input.menuDescription || null,
      special_requirements: input.specialRequirements || null,
      ...eventColumns(input),
      status: input.status as EventStatus,
      total_amount: input.totalAmount ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;

  const rows = dayRows(input.companyId, data.id, input);
  if (rows.length > 0) {
    const { error: daysError } = await supabase.from("catering_event_days").insert(rows);
    if (daysError) {
      // do not leave a half-saved multi-day event behind
      await supabase.from("catering_events").delete().eq("id", data.id);
      throw daysError;
    }
  }
  await recordAudit({ companyId: input.companyId, relatedTable: "catering_events", relatedId: data.id, action: "created", newValue: input.eventName });
  revalidatePath("/catering");
  return data;
}

export async function updateEvent(eventId: string, input: EventInput) {
  const { supabase } = await requireUser();
  validateEvent(input);

  const { data: existing, error: existingError } = await supabase.from("catering_events").select("company_id").eq("id", eventId).single();
  if (existingError) throw existingError;

  const { error } = await supabase
    .from("catering_events")
    .update({
      customer_id: input.customerId || null,
      event_name: input.eventName,
      location: input.location || null,
      event_type: input.eventType,
      package_menu_id: input.packageMenuId || null,
      menu_description: input.menuDescription || null,
      special_requirements: input.specialRequirements || null,
      ...eventColumns(input),
      total_amount: input.totalAmount ?? null,
    })
    .eq("id", eventId);
  if (error) throw error;

  // The form always sends the full list of days. Days are matched by date and updated in place (not deleted and
  // re-inserted) so the production orders and deliveries already made for a day keep their link to it.
  const rows = dayRows(existing.company_id, eventId, input);
  if (rows.length > 0) {
    const { error: daysError } = await supabase.from("catering_event_days").upsert(rows, { onConflict: "catering_event_id,day_date" });
    if (daysError) throw daysError;
  }
  // Days that are no longer in the list are removed; their production orders / deliveries stay, just without a day link.
  const removeQuery = supabase.from("catering_event_days").delete().eq("catering_event_id", eventId);
  const { error: clearError } = rows.length > 0 ? await removeQuery.not("day_date", "in", `(${rows.map((r) => r.day_date).join(",")})`) : await removeQuery;
  if (clearError) throw clearError;
  revalidatePath("/catering");
  revalidatePath(`/catering/${eventId}`);
}

/**
 * The Catering -> Kitchen and Catering -> Driver connection: confirming an
 * event gives Kitchen a production order and Operation Management a delivery
 * record to work from, automatically. Both modules just read tables that
 * already exist — no extra plumbing needed once they get their own UI.
 */
export async function updateEventStatus(eventId: string, status: string) {
  const { supabase } = await requireUser();

  const { data: event, error: eventError } = await supabase
    .from("catering_events")
    .select("id, company_id, event_date, event_time, pax_count, status")
    .eq("id", eventId)
    .single();
  if (eventError) throw eventError;

  const creating = status === "confirmed" || status === "in_production";
  const days = creating ? await listDaysForWork(supabase, eventId) : [];

  const { error: updateError } = await supabase.from("catering_events").update({ status: status as EventStatus }).eq("id", eventId);
  if (updateError) throw updateError;
  if (event.status !== status) {
    await recordAudit({ companyId: event.company_id, relatedTable: "catering_events", relatedId: eventId, action: "status_changed", previousValue: event.status, newValue: status });
  }

  if (creating) {
    if (days.length > 0) await createWorkForDays(supabase, event.company_id, eventId, days);
    else await createWorkForSingleDay(supabase, event);
  }

  revalidatePath("/catering");
  revalidatePath(`/catering/${eventId}`);
  revalidatePath("/kitchen");
  revalidatePath("/driver-logistics");
  revalidatePath("/");
}

type Client = Awaited<ReturnType<typeof requireUser>>["supabase"];
type WorkDay = {
  id: string;
  day_date: string;
  event_time: string | null;
  service_pax: number;
  second_service_type: string | null;
  second_service_pax: number | null;
};

async function listDaysForWork(supabase: Client, eventId: string): Promise<WorkDay[]> {
  const { data, error } = await supabase
    .from("catering_event_days")
    .select("id, day_date, event_time, service_pax, second_service_type, second_service_pax")
    .eq("catering_event_id", eventId)
    .order("day_date");
  if (error) throw error;
  return data ?? [];
}

/** When a day's food is due: the day's date and its event time (00:00 if none), Malaysia time. */
function dayScheduledTime(day: Pick<WorkDay, "day_date" | "event_time">) {
  return `${day.day_date}T${day.event_time ?? "00:00:00"}+08:00`;
}

const UNIQUE_VIOLATION = "23505";

/** Single-day event (no days): one production order and one delivery for the event, exactly as before. */
async function createWorkForSingleDay(
  supabase: Client,
  event: { id: string; company_id: string; event_date: string; event_time: string | null; pax_count: number | null },
) {
  const { data: existingProduction } = await supabase
    .from("production_orders")
    .select("id")
    .eq("catering_event_id", event.id)
    .limit(1)
    .maybeSingle();

  if (!existingProduction) {
    await supabase.from("production_orders").insert({
      company_id: event.company_id,
      catering_event_id: event.id,
      planned_date: event.event_date,
      pax_count: event.pax_count,
      status: "planned",
    });
  }

  const { data: existingDelivery } = await supabase
    .from("deliveries")
    .select("id")
    .eq("catering_event_id", event.id)
    .limit(1)
    .maybeSingle();

  if (!existingDelivery) {
    const scheduledTime = event.event_time ? `${event.event_date}T${event.event_time}+08:00` : `${event.event_date}T00:00:00+08:00`;
    await supabase.from("deliveries").insert({
      company_id: event.company_id,
      catering_event_id: event.id,
      scheduled_time: scheduledTime,
      status: "scheduled",
    });
  }
}

/** The calendar date of a timestamp, as UTC and as Malaysia time, to recognise rows made before days were linked. */
function timestampDates(ts: string | null): string[] {
  if (!ts) return [];
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return [];
  return [new Date(t).toISOString().slice(0, 10), new Date(t + 8 * 3600_000).toISOString().slice(0, 10)];
}

/**
 * Multi-day event: one production order and one delivery for EACH day (date, time and pax taken from that day).
 * Safe to run again: a day that already has its rows is skipped, and an older event-level row that matches the
 * day's date is linked to that day instead of being duplicated. Existing rows are never otherwise changed or deleted.
 */
async function createWorkForDays(supabase: Client, companyId: string, eventId: string, days: WorkDay[]) {
  const [{ data: orders, error: ordersError }, { data: deliveries, error: deliveriesError }] = await Promise.all([
    supabase.from("production_orders").select("id, planned_date, catering_event_day_id, recipe_id, menu_plan_dish_id").eq("catering_event_id", eventId),
    supabase.from("deliveries").select("id, scheduled_time, catering_event_day_id").eq("catering_event_id", eventId),
  ]);
  if (ordersError) throw ordersError;
  if (deliveriesError) throw deliveriesError;

  const claimed = new Set<string>();
  for (const day of days) {
    const pax = dayPax({
      servicePax: day.service_pax,
      secondServiceType: day.second_service_type ?? undefined,
      secondServicePax: day.second_service_pax ?? undefined,
    });

    if (!(orders ?? []).some((o) => o.catering_event_day_id === day.id)) {
      const legacy = (orders ?? []).find(
        (o) => !o.catering_event_day_id && !claimed.has(o.id) && !o.recipe_id && !o.menu_plan_dish_id && o.planned_date === day.day_date,
      );
      if (legacy) {
        claimed.add(legacy.id);
        const { error } = await supabase.from("production_orders").update({ catering_event_day_id: day.id }).eq("id", legacy.id);
        if (error && error.code !== UNIQUE_VIOLATION) throw error;
      } else {
        const { error } = await supabase.from("production_orders").insert({
          company_id: companyId,
          catering_event_id: eventId,
          catering_event_day_id: day.id,
          planned_date: day.day_date,
          pax_count: pax,
          status: "planned",
        });
        if (error && error.code !== UNIQUE_VIOLATION) throw error;
      }
    }

    if (!(deliveries ?? []).some((d) => d.catering_event_day_id === day.id)) {
      const legacy = (deliveries ?? []).find(
        (d) => !d.catering_event_day_id && !claimed.has(d.id) && timestampDates(d.scheduled_time).includes(day.day_date),
      );
      if (legacy) {
        claimed.add(legacy.id);
        const { error } = await supabase.from("deliveries").update({ catering_event_day_id: day.id }).eq("id", legacy.id);
        if (error && error.code !== UNIQUE_VIOLATION) throw error;
      } else {
        const { error } = await supabase.from("deliveries").insert({
          company_id: companyId,
          catering_event_id: eventId,
          catering_event_day_id: day.id,
          scheduled_time: dayScheduledTime(day),
          status: "scheduled",
        });
        if (error && error.code !== UNIQUE_VIOLATION) throw error;
      }
    }
  }
}

export type QuotationInput = {
  companyId: string;
  eventId: string;
  quotationNumber: string;
  items: { itemName: string; quantity: number; unitPrice: number; discountPercent: number }[];
};

export async function createQuotation(input: QuotationInput) {
  const { supabase } = await requireUser();

  const items = input.items.map((item, i) => {
    const gross = item.quantity * item.unitPrice;
    const lineTotal = gross * (1 - item.discountPercent / 100);
    return {
      item_name: item.itemName,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      discount_percent: item.discountPercent,
      line_total: Math.round(lineTotal * 100) / 100,
      sort_order: i,
    };
  });
  const totalAmount = Math.round(items.reduce((t, i) => t + i.line_total, 0) * 100) / 100;

  const { data: quotation, error: quotationError } = await supabase
    .from("quotations")
    .insert({
      company_id: input.companyId,
      catering_event_id: input.eventId,
      quotation_number: input.quotationNumber,
      total_amount: totalAmount,
    })
    .select("id")
    .single();
  if (quotationError) throw quotationError;

  const { error: itemsError } = await supabase
    .from("quotation_items")
    .insert(items.map((i) => ({ ...i, quotation_id: quotation.id })));
  if (itemsError) throw itemsError;

  await supabase.from("catering_events").update({ total_amount: totalAmount }).eq("id", input.eventId);

  await recordAudit({ companyId: input.companyId, relatedTable: "quotations", relatedId: quotation.id, action: "created", newValue: `${input.quotationNumber} · RM ${totalAmount.toFixed(2)}` });
  revalidatePath(`/catering/${input.eventId}`);
  return quotation;
}

/**
 * The Catering -> Finance connection: accepting a quotation creates the
 * customer invoice Admin & Finance (and the dashboard's Customer
 * Outstanding / Revenue figures) already reads from.
 */
export async function updateQuotationStatus(quotationId: string, status: string) {
  const { supabase } = await requireUser();

  const { data: quotation, error: fetchError } = await supabase
    .from("quotations")
    .select("id, company_id, catering_event_id, quotation_number, total_amount, status, catering_events(customer_id)")
    .eq("id", quotationId)
    .single();
  if (fetchError) throw fetchError;

  const { error: updateError } = await supabase.from("quotations").update({ status }).eq("id", quotationId);
  if (updateError) throw updateError;
  if (quotation.status !== status) {
    await recordAudit({ companyId: quotation.company_id, relatedTable: "quotations", relatedId: quotationId, action: "status_changed", previousValue: quotation.status, newValue: status });
  }

  if (status === "accepted") {
    // Reuse updateEventStatus so accepting a quotation also creates the
    // Kitchen production order and Driver delivery record, exactly as if
    // someone had confirmed the event manually.
    await updateEventStatus(quotation.catering_event_id, "confirmed");

    // The invoice belongs to Finance, so a member limited to Catering cannot write it themselves. The user was
    // already verified for this quotation above (it was read and updated under their own access), so the
    // system creates the invoice on their behalf.
    const finance = createAdminClient();
    const customerId = quotation.catering_events?.customer_id;
    if (customerId) {
      const { data: existingInvoice } = await finance
        .from("customer_invoices")
        .select("id")
        .eq("quotation_id", quotationId)
        .maybeSingle();

      if (!existingInvoice) {
        // the invoice date is today (Malaysia); the due date follows the customer's payment term (14 days when there is none)
        const invoiceDate = todayInMalaysia();
        const { data: customer } = await finance.from("customers").select("credit_term").eq("id", customerId).maybeSingle();

        await finance.from("customer_invoices").insert({
          company_id: quotation.company_id,
          customer_id: customerId,
          catering_event_id: quotation.catering_event_id,
          quotation_id: quotationId,
          invoice_number: quotation.quotation_number,
          invoice_date: invoiceDate,
          due_date: dueDateFromTerms(invoiceDate, customer?.credit_term),
          amount: quotation.total_amount,
          status: "pending_review",
        });
      }
    }
  }

  revalidatePath(`/catering/${quotation.catering_event_id}`);
  revalidatePath("/catering/quotations");
  revalidatePath("/");
}

export async function updateQuotationPaymentStatus(quotationId: string, paymentStatus: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("quotations").update({ payment_status: paymentStatus }).eq("id", quotationId);
  if (error) throw error;
  revalidatePath("/catering/quotations");
}

export type CostingInput = {
  companyId: string;
  eventId: string;
  foodCost: number;
  ingredientCost: number;
  staffCost: number;
  transportCost: number;
  equipmentCost: number;
  otherCost: number;
  notes?: string;
};

export async function upsertCosting(input: CostingInput) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("event_costing")
    .upsert(
      {
        company_id: input.companyId,
        catering_event_id: input.eventId,
        food_cost: input.foodCost,
        ingredient_cost: input.ingredientCost,
        staff_cost: input.staffCost,
        transport_cost: input.transportCost,
        equipment_cost: input.equipmentCost,
        other_cost: input.otherCost,
        notes: input.notes || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "catering_event_id" },
    );
  if (error) throw error;
  revalidatePath(`/catering/${input.eventId}`);
}

export async function addStaffAssignment(input: {
  companyId: string;
  eventId: string;
  employeeId: string;
  role: string;
  notes?: string;
}) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("event_staff").insert({
    company_id: input.companyId,
    catering_event_id: input.eventId,
    employee_id: input.employeeId,
    role: input.role,
    notes: input.notes || null,
  });
  if (error) throw error;
  revalidatePath(`/catering/${input.eventId}`);
}

export async function removeStaffAssignment(assignmentId: string, eventId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("event_staff").delete().eq("id", assignmentId);
  if (error) throw error;
  revalidatePath(`/catering/${eventId}`);
}

export async function createEquipment(input: { companyId: string; name: string; unit?: string; totalQuantity: number }) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("equipment")
    .insert({ company_id: input.companyId, name: input.name, unit: input.unit || null, total_quantity: input.totalQuantity })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export async function addEquipmentAssignment(input: {
  companyId: string;
  eventId: string;
  equipmentId: string;
  quantityNeeded: number;
}) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("event_equipment").insert({
    company_id: input.companyId,
    catering_event_id: input.eventId,
    equipment_id: input.equipmentId,
    quantity_needed: input.quantityNeeded,
  });
  if (error) throw error;
  revalidatePath(`/catering/${input.eventId}`);
}

export async function removeEquipmentAssignment(assignmentId: string, eventId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("event_equipment").delete().eq("id", assignmentId);
  if (error) throw error;
  revalidatePath(`/catering/${eventId}`);
}

export type DeliveryInput = {
  /** Not trusted: the company always comes from the event itself. */
  companyId: string;
  eventId: string;
  /** The delivery being edited (a multi-day event has one per day). */
  deliveryId?: string;
  /** The event day this delivery is for, when there is no delivery for it yet. */
  dayId?: string;
  vehicleId?: string;
  driverId?: string;
  vendorId?: string;
  notes?: string;
};

export async function upsertDelivery(input: DeliveryInput) {
  const { supabase } = await requireUser();
  const { data: event, error: eventError } = await supabase.from("catering_events").select("id, company_id").eq("id", input.eventId).single();
  if (eventError) throw eventError;
  await assertValidAssignee(supabase, event.company_id, input.driverId, input.vendorId);

  const fields = {
    vehicle_id: input.vehicleId || null,
    driver_id: input.driverId || null,
    delivery_vendor_id: input.vendorId || null,
    notes: input.notes || null,
  };

  let existingId: string | null = null;
  let day: WorkDay | null = null;
  if (input.deliveryId) {
    const { data: found, error } = await supabase.from("deliveries").select("id, catering_event_id").eq("id", input.deliveryId).single();
    if (error) throw error;
    if (found.catering_event_id !== input.eventId) throw new Error("This delivery does not belong to this event.");
    existingId = found.id;
  } else if (input.dayId) {
    const { data: found, error } = await supabase
      .from("catering_event_days")
      .select("id, day_date, event_time, service_pax, second_service_type, second_service_pax, catering_event_id")
      .eq("id", input.dayId)
      .single();
    if (error) throw error;
    if (found.catering_event_id !== input.eventId) throw new Error("This day does not belong to this event.");
    day = found;
    const { data: byDay } = await supabase.from("deliveries").select("id").eq("catering_event_day_id", input.dayId).limit(1).maybeSingle();
    existingId = byDay?.id ?? null;
  } else {
    // single-day event: its one delivery
    const { data: first } = await supabase
      .from("deliveries")
      .select("id")
      .eq("catering_event_id", input.eventId)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    existingId = first?.id ?? null;
  }

  if (existingId) {
    const { error } = await supabase.from("deliveries").update(fields).eq("id", existingId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("deliveries").insert({
      company_id: event.company_id,
      catering_event_id: input.eventId,
      catering_event_day_id: day?.id ?? null,
      // Always worked out on the server (the day's date and time, or the server clock), never a value sent by the browser.
      scheduled_time: day ? dayScheduledTime(day) : new Date().toISOString(),
      ...fields,
      status: "scheduled",
    });
    if (error) throw error;
  }

  revalidatePath(`/catering/${input.eventId}`);
  revalidatePath("/driver-logistics");
  revalidatePath("/");
}

type CTables = Database["public"]["Tables"];
export type QuotationRow = CTables["quotations"]["Row"];
export type QuotationItemRow = CTables["quotation_items"]["Row"];
export type QuotationSnapshot = { quotation: QuotationRow; items: QuotationItemRow[] };
export type EventRow = CTables["catering_events"]["Row"];
export type EventDayRow = CTables["catering_event_days"]["Row"];
export type EventSnapshot = { event: EventRow; days: EventDayRow[] };
export type CustomerRow = CTables["customers"]["Row"];

async function cateringAdmin(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], companyId: string, message: string) {
  const { data } = await supabase.rpc("user_is_company_admin", { target_company_id: companyId });
  if (data !== true) throw new Error(message);
}

const total = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

export type QuotationEdit = { quotationNumber: string; items: { itemName: string; quantity: number; unitPrice: number; discountPercent: number }[] };

/** Changes a quotation that is not accepted yet (number and items; the totals are worked out as when it was made). */
export async function updateQuotation(id: string, input: QuotationEdit): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: before } = await supabase.from("quotations").select("*, quotation_items(*)").eq("id", id).maybeSingle();
    if (!before) throw new Error("This quotation was not found (it may have been deleted).");
    if (before.status === "accepted") throw new Error("An accepted quotation already has an invoice, so it cannot be changed.");
    if (!input.quotationNumber?.trim()) throw new Error("Enter the quotation number.");
    const rows = input.items.filter((i) => i.itemName.trim());
    if (rows.length === 0) throw new Error("A quotation needs at least one item.");
    for (const i of rows) if (![i.quantity, i.unitPrice, i.discountPercent].every(Number.isFinite) || i.quantity <= 0 || i.unitPrice < 0 || i.discountPercent < 0 || i.discountPercent > 100) throw new Error(`Check the numbers of ${i.itemName.trim()}.`);
    const items = rows.map((i, n) => ({ item_name: i.itemName.trim(), quantity: i.quantity, unit_price: i.unitPrice, discount_percent: i.discountPercent, line_total: Math.round(i.quantity * i.unitPrice * (1 - i.discountPercent / 100) * 100) / 100, sort_order: n }));
    const totalAmount = Math.round(items.reduce((t, i) => t + i.line_total, 0) * 100) / 100;
    const { error } = await supabase.from("quotations").update({ quotation_number: input.quotationNumber.trim(), total_amount: totalAmount }).eq("id", id);
    if (error) throw error;
    const { error: deleteError } = await supabase.from("quotation_items").delete().eq("quotation_id", id);
    if (deleteError) throw deleteError;
    const { error: insertError } = await supabase.from("quotation_items").insert(items.map((i) => ({ ...i, quotation_id: id })));
    if (insertError) {
      await supabase.from("quotation_items").insert(before.quotation_items);
      throw insertError;
    }
    await supabase.from("catering_events").update({ total_amount: totalAmount }).eq("id", before.catering_event_id);
    await recordAudit({ companyId: before.company_id, relatedTable: "quotations", relatedId: id, action: "edited", previousValue: `${before.quotation_number} · RM ${before.total_amount}`, newValue: `${input.quotationNumber.trim()} · RM ${totalAmount.toFixed(2)}` });
    revalidatePath(`/catering/${before.catering_event_id}`);
    revalidatePath("/catering/quotations");
    return {};
  }, "Could not save the quotation. Please try again.");
}

/** Deletes a quotation (with its items) that is not accepted; returns both so the delete can be undone. */
export async function deleteQuotation(id: string): Promise<ActionResult<{ row: QuotationSnapshot }>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: q } = await supabase.from("quotations").select("*, quotation_items(*)").eq("id", id).maybeSingle();
    if (!q) throw new Error("This quotation was not found (it may already be deleted).");
    if (q.status === "accepted") throw new Error("An accepted quotation already has an invoice, so it cannot be deleted.");
    const { quotation_items: items, ...row } = q;
    const { data: removed, error } = await supabase.from("quotations").delete().eq("id", id).select("id");
    if (error || !removed?.length) throw new Error("Could not delete the quotation.");
    await recordAudit({ companyId: q.company_id, relatedTable: "quotations", relatedId: id, action: "deleted", previousValue: `${q.quotation_number} · RM ${q.total_amount} · ${items.length} item(s)`, newValue: "Deleted" });
    revalidatePath(`/catering/${q.catering_event_id}`);
    revalidatePath("/catering/quotations");
    return { row: { quotation: row, items } };
  }, "Could not delete the quotation. Please try again.");
}

/** Undo of a delete: the quotation and its items come back as they were. */
export async function restoreQuotation(snapshot: QuotationSnapshot): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { quotation, items } = snapshot;
    if (!quotation?.id || !quotation.company_id) throw new Error("There is nothing to put back.");
    const { error } = await supabase.from("quotations").insert(quotation);
    if (error) throw new Error("Could not put the quotation back.");
    if (items.length > 0) {
      const { error: itemsError } = await supabase.from("quotation_items").insert(items);
      if (itemsError) {
        await supabase.from("quotations").delete().eq("id", quotation.id);
        throw new Error("Could not put the quotation back.");
      }
    }
    await recordAudit({ companyId: quotation.company_id, relatedTable: "quotations", relatedId: quotation.id, action: "restored", newValue: `${quotation.quotation_number} put back after it was deleted` });
    revalidatePath(`/catering/${quotation.catering_event_id}`);
    revalidatePath("/catering/quotations");
    return {};
  }, "Could not put the quotation back.");
}

/**
 * Deletes an event that nothing has been built on: it must be an enquiry, a quoted or a cancelled event with no quotation, costing, staff,
 * equipment, production, delivery, cost, revenue or invoice. Its days are kept for Undo.
 */
export async function deleteEvent(id: string): Promise<ActionResult<{ row: EventSnapshot }>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: event } = await supabase.from("catering_events").select("*").eq("id", id).maybeSingle();
    if (!event) throw new Error("This event was not found (it may already be deleted).");
    await cateringAdmin(supabase, event.company_id, "Only an admin of the company can delete an event. You can cancel it instead.");
    if (!["enquiry", "quoted", "cancelled"].includes(event.status)) throw new Error("A confirmed event cannot be deleted. Cancel it first.");
    const head = { count: "exact" as const, head: true };
    const checks: [string, PromiseLike<{ count: number | null }>][] = [
      ["quotation(s)", supabase.from("quotations").select("id", head).eq("catering_event_id", id)],
      ["staff assignment(s)", supabase.from("event_staff").select("id", head).eq("catering_event_id", id)],
      ["equipment assignment(s)", supabase.from("event_equipment").select("id", head).eq("catering_event_id", id)],
      ["production order(s)", supabase.from("production_orders").select("id", head).eq("catering_event_id", id)],
      ["delivery(ies)", supabase.from("deliveries").select("id", head).eq("catering_event_id", id)],
      ["cost entry(ies)", supabase.from("event_cost_entries").select("id", head).eq("catering_event_id", id)],
      ["revenue entry(ies)", supabase.from("event_revenue_entries").select("id", head).eq("catering_event_id", id)],
      ["budget(s)", supabase.from("event_budgets").select("id", head).eq("catering_event_id", id)],
      ["costing", supabase.from("event_costing").select("id", head).eq("catering_event_id", id)],
      ["customer invoice(s)", supabase.from("customer_invoices").select("id", head).eq("catering_event_id", id)],
    ];
    const counts = await Promise.all(checks.map(([, q]) => total(q)));
    const used = checks.map(([label], i) => (counts[i] > 0 ? `${counts[i]} ${label}` : null)).filter(Boolean);
    if (used.length > 0) throw new Error(`This event cannot be deleted: it has ${used.join(", ")}. Remove those first, or cancel the event instead.`);
    const { data: days } = await supabase.from("catering_event_days").select("*").eq("catering_event_id", id);
    const { data: removed, error } = await supabase.from("catering_events").delete().eq("id", id).select("id");
    if (error || !removed?.length) throw new Error("The event could not be deleted. Cancel it instead.");
    await recordAudit({ companyId: event.company_id, relatedTable: "catering_events", relatedId: id, action: "deleted", previousValue: `${event.event_name} · ${event.event_date} · ${event.status}${event.pax_count ? ` · ${event.pax_count} pax` : ""}`, newValue: "Deleted" });
    revalidatePath("/catering");
    revalidatePath("/catering/calendar");
    return { row: { event, days: days ?? [] } };
  }, "Could not delete the event. Please try again.");
}

/** Undo of a delete: the event and its days come back as they were. */
export async function restoreEvent(snapshot: EventSnapshot): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { event, days } = snapshot;
    if (!event?.id || !event.company_id) throw new Error("There is nothing to put back.");
    await cateringAdmin(supabase, event.company_id, "Only an admin of the company can put an event back.");
    const { error } = await supabase.from("catering_events").insert(event);
    if (error) throw new Error("Could not put the event back.");
    if (days.length > 0) {
      const { error: daysError } = await supabase.from("catering_event_days").insert(days);
      if (daysError) {
        await supabase.from("catering_events").delete().eq("id", event.id);
        throw new Error("Could not put the event back.");
      }
    }
    await recordAudit({ companyId: event.company_id, relatedTable: "catering_events", relatedId: event.id, action: "restored", newValue: `${event.event_name} put back after it was deleted` });
    revalidatePath("/catering");
    revalidatePath("/catering/calendar");
    return {};
  }, "Could not put the event back.");
}

export type CustomerEdit = {
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  registrationNo?: string;
  billingAddress?: string;
  deliveryAddress?: string;
  area?: string;
  creditTerm?: string;
  notes?: string;
};

/** Changes the details of a customer. */
export async function updateCustomer(id: string, input: CustomerEdit): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: before } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
    if (!before) throw new Error("This customer was not found (it may have been deleted).");
    if (!input.name?.trim()) throw new Error("Write the name of the customer.");
    const t = (v?: string) => v?.trim() || null;
    const { error } = await supabase
      .from("customers")
      .update({ name: input.name.trim(), contact_person: t(input.contactPerson), phone: t(input.phone), email: t(input.email), registration_no: t(input.registrationNo), billing_address: t(input.billingAddress), delivery_address: t(input.deliveryAddress), area: t(input.area), credit_term: t(input.creditTerm), notes: t(input.notes) })
      .eq("id", id);
    if (error) throw error;
    await recordAudit({ companyId: before.company_id, relatedTable: "customers", relatedId: id, action: "edited", previousValue: `${before.name} · ${before.phone ?? "no phone"}`, newValue: `${input.name.trim()} · ${input.phone?.trim() || "no phone"}` });
    revalidatePath(`/catering/customers/${id}`);
    revalidatePath("/catering/customers");
    return {};
  }, "Could not save the customer. Please try again.");
}

/** Deletes a customer that has no event or invoice (otherwise the customer is kept); returns it so the delete can be undone. */
export async function deleteCustomer(id: string): Promise<ActionResult<{ row: CustomerRow }>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: customer } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
    if (!customer) throw new Error("This customer was not found (it may already be deleted).");
    await cateringAdmin(supabase, customer.company_id, "Only an admin of the company can delete a customer.");
    const head = { count: "exact" as const, head: true };
    const [events, invoices] = await Promise.all([
      total(supabase.from("catering_events").select("id", head).eq("customer_id", id)),
      total(supabase.from("customer_invoices").select("id", head).eq("customer_id", id)),
    ]);
    if (events > 0 || invoices > 0) throw new Error(`This customer cannot be deleted: it has ${[events && `${events} event(s)`, invoices && `${invoices} invoice(s)`].filter(Boolean).join(" and ")}.`);
    const { data: removed, error } = await supabase.from("customers").delete().eq("id", id).select("id");
    if (error || !removed?.length) throw new Error("Could not delete the customer.");
    await recordAudit({ companyId: customer.company_id, relatedTable: "customers", relatedId: id, action: "deleted", previousValue: `${customer.name} · ${customer.phone ?? "no phone"}`, newValue: "Deleted" });
    revalidatePath("/catering/customers");
    return { row: customer };
  }, "Could not delete the customer. Please try again.");
}

/** Undo of a delete: the customer comes back as it was. */
export async function restoreCustomer(row: CustomerRow): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    if (!row?.id || !row.company_id) throw new Error("There is nothing to put back.");
    await cateringAdmin(supabase, row.company_id, "Only an admin of the company can put a customer back.");
    const { error } = await supabase.from("customers").insert(row);
    if (error) throw new Error("Could not put the customer back.");
    await recordAudit({ companyId: row.company_id, relatedTable: "customers", relatedId: row.id, action: "restored", newValue: `${row.name} put back after it was deleted` });
    revalidatePath("/catering/customers");
    return {};
  }, "Could not put the customer back.");
}
