"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertValidAssignee } from "@/lib/driver/assignee";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import { SALES_AGENTS } from "@/lib/catering/constants";
import { dayPax, type EventDay } from "@/lib/catering/days";
import { validateDays, validateServiceDetails } from "@/lib/catering/validation";

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
    menu_details: clean(d.menuDetails),
    price_per_pax: d.pricePerPax ?? null,
    remarks: clean(d.remarks),
    sort_order: i,
  }));
}

function validateEvent(input: EventInput) {
  validateContact(input);
  if ((input.days?.length ?? 0) > 0) validateDays(input.days ?? []);
  else validateServiceDetails(input, true);
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

  // the form always sends the full list of days, so the saved days are replaced by it
  const { error: clearError } = await supabase.from("catering_event_days").delete().eq("catering_event_id", eventId);
  if (clearError) throw clearError;
  const rows = dayRows(existing.company_id, eventId, input);
  if (rows.length > 0) {
    const { error: daysError } = await supabase.from("catering_event_days").insert(rows);
    if (daysError) throw daysError;
  }
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
    .select("id, company_id, event_date, event_time, pax_count")
    .eq("id", eventId)
    .single();
  if (eventError) throw eventError;

  const { error: updateError } = await supabase.from("catering_events").update({ status: status as EventStatus }).eq("id", eventId);
  if (updateError) throw updateError;

  if (status === "confirmed" || status === "in_production") {
    const { data: existingProduction } = await supabase
      .from("production_orders")
      .select("id")
      .eq("catering_event_id", eventId)
      .maybeSingle();

    if (!existingProduction) {
      await supabase.from("production_orders").insert({
        company_id: event.company_id,
        catering_event_id: eventId,
        planned_date: event.event_date,
        pax_count: event.pax_count,
        status: "planned",
      });
    }

    const { data: existingDelivery } = await supabase
      .from("deliveries")
      .select("id")
      .eq("catering_event_id", eventId)
      .maybeSingle();

    if (!existingDelivery) {
      const scheduledTime = event.event_time
        ? `${event.event_date}T${event.event_time}`
        : `${event.event_date}T00:00:00`;
      await supabase.from("deliveries").insert({
        company_id: event.company_id,
        catering_event_id: eventId,
        scheduled_time: scheduledTime,
        status: "scheduled",
      });
    }
  }

  revalidatePath("/catering");
  revalidatePath(`/catering/${eventId}`);
  revalidatePath("/");
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
    .select("id, company_id, catering_event_id, quotation_number, total_amount, catering_events(customer_id)")
    .eq("id", quotationId)
    .single();
  if (fetchError) throw fetchError;

  const { error: updateError } = await supabase.from("quotations").update({ status }).eq("id", quotationId);
  if (updateError) throw updateError;

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
        const today = new Date();
        const dueDate = new Date(today);
        dueDate.setDate(dueDate.getDate() + 14);

        await finance.from("customer_invoices").insert({
          company_id: quotation.company_id,
          customer_id: customerId,
          catering_event_id: quotation.catering_event_id,
          quotation_id: quotationId,
          invoice_number: quotation.quotation_number,
          invoice_date: today.toISOString().slice(0, 10),
          due_date: dueDate.toISOString().slice(0, 10),
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
  companyId: string;
  eventId: string;
  vehicleId?: string;
  driverId?: string;
  vendorId?: string;
  notes?: string;
};

export async function upsertDelivery(input: DeliveryInput) {
  const { supabase } = await requireUser();
  await assertValidAssignee(supabase, input.companyId, input.driverId, input.vendorId);

  const { data: existing } = await supabase
    .from("deliveries")
    .select("id")
    .eq("catering_event_id", input.eventId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("deliveries")
      .update({
        vehicle_id: input.vehicleId || null,
        driver_id: input.driverId || null,
        delivery_vendor_id: input.vendorId || null,
        notes: input.notes || null,
      })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("deliveries").insert({
      company_id: input.companyId,
      catering_event_id: input.eventId,
      // Always the server clock, never a value sent by the browser.
      scheduled_time: new Date().toISOString(),
      vehicle_id: input.vehicleId || null,
      driver_id: input.driverId || null,
      delivery_vendor_id: input.vendorId || null,
      notes: input.notes || null,
      status: "scheduled",
    });
    if (error) throw error;
  }

  revalidatePath(`/catering/${input.eventId}`);
  revalidatePath("/");
}
