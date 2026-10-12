"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import { EVENT_TYPE_LABEL, MAX_EVENT_DAYS, SALES_AGENTS } from "@/lib/catering/constants";
import { dayPax, quotationSeedRows, type EventDay } from "@/lib/catering/days";
import { INTAKE_COMPANIES, INTAKE_HOURLY_LIMIT } from "@/lib/catering/intake";
import { MAX_EXTRA_ITEMS, type ExtraItem, type QuotationRequestInput } from "@/lib/catering/quotationRequest";
import { validateDays } from "@/lib/catering/validation";
import { createEvent, createQuotation } from "@/lib/catering/actions";

type Result = { ok: boolean; error?: string; eventId?: string };

const clean = (s: string | undefined, max = 500) => {
  const v = s?.trim();
  if (!v) return null;
  if (v.length > max) throw new Error("One of the fields is too long.");
  return v;
};

/** Keeps only the known day fields, trimmed and size-limited, so nothing else can be smuggled into the saved request. */
function sanitizeDay(d: EventDay): EventDay {
  return {
    dayDate: d.dayDate,
    setupTime: d.setupTime || undefined,
    eventTime: d.eventTime || undefined,
    mealTypes: d.mealTypes ?? [],
    serviceType: d.serviceType,
    servicePax: d.servicePax,
    secondServiceType: d.secondServiceType || undefined,
    secondServicePax: d.secondServiceType ? d.secondServicePax : undefined,
    menuDetails: clean(d.menuDetails, 3000) ?? undefined,
    pricePerPax: d.pricePerPax,
    remarks: clean(d.remarks, 1000) ?? undefined,
  };
}

function sanitizeExtras(items: ExtraItem[]): ExtraItem[] {
  if (items.length > MAX_EXTRA_ITEMS) throw new Error(`At most ${MAX_EXTRA_ITEMS} extra items.`);
  return items
    .filter((i) => i.itemName?.trim() || i.unitPrice)
    .map((i, n) => {
      const name = clean(i.itemName, 200);
      if (!name) throw new Error(`Extra item ${n + 1}: enter the item name.`);
      if (!(i.quantity > 0)) throw new Error(`Extra item ${n + 1}: the quantity must be more than 0.`);
      if (!(i.unitPrice >= 0)) throw new Error(`Extra item ${n + 1}: the price cannot be negative.`);
      return { itemName: name, quantity: i.quantity, unitPrice: i.unitPrice };
    });
}

/**
 * Public (no login): a sales agent sends a quotation request. The company comes from the link, the request is only
 * stored as "pending" and never becomes an event or quotation until someone with Catering access approves it.
 * The message is returned (not thrown) so the person always sees it, also on the live site where thrown messages are hidden.
 */
export async function submitQuotationRequest(companySlug: string, input: QuotationRequestInput): Promise<Result> {
  try {
    return await saveQuotationRequest(companySlug, input);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save. Please try again." };
  }
}

async function saveQuotationRequest(companySlug: string, input: QuotationRequestInput): Promise<Result> {
  const company = INTAKE_COMPANIES[companySlug];
  if (!company) throw new Error("This link is not valid.");
  // a bot fills the hidden field; pretend it worked so it learns nothing
  if (input.website?.trim()) return { ok: true };

  if (!SALES_AGENTS.includes(input.salesAgent)) throw new Error("Select your name from the sales agent list.");
  const customerName = clean(input.customerName, 200);
  if (!customerName) throw new Error("Enter the customer name.");
  const eventName = clean(input.eventName, 200);
  if (!eventName) throw new Error("Enter the event name.");
  if (!EVENT_TYPE_LABEL[input.eventType]) throw new Error("Select the event type.");

  if (!Array.isArray(input.days) || input.days.length === 0) throw new Error("Add at least one event day.");
  if (input.days.length > MAX_EVENT_DAYS) throw new Error(`At most ${MAX_EVENT_DAYS} days.`);
  const days = input.days.map(sanitizeDay).sort((a, b) => a.dayDate.localeCompare(b.dayDate));
  validateDays(days);
  const extraItems = sanitizeExtras(input.extraItems ?? []);
  const hasPrice = days.some((d) => (d.pricePerPax ?? 0) > 0) || extraItems.some((i) => i.unitPrice > 0);
  if (!hasPrice) throw new Error("Enter the price per pax for at least one day (or an extra item with a price).");

  const admin = createAdminClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("quotation_requests")
    .select("id", { count: "exact", head: true })
    .eq("company_id", company.id)
    .gte("created_at", since);
  if ((count ?? 0) >= INTAKE_HOURLY_LIMIT) throw new Error("Too many submissions right now. Please try again in a while.");

  const { error } = await admin.from("quotation_requests").insert({
    company_id: company.id,
    sales_agent: input.salesAgent,
    customer_name: customerName,
    event_name: eventName,
    event_type: input.eventType,
    location: clean(input.location, 300),
    pic_name: clean(input.picName, 200),
    pic_phone: clean(input.picPhone, 50),
    kitchen_setup: clean(input.kitchenSetup, 2000),
    catering_setup: clean(input.cateringSetup, 2000),
    remarks: clean(input.remarks, 2000),
    days: days as unknown as Json,
    extra_items: extraItems as unknown as Json,
  });
  if (error) throw new Error("Could not save. Please try again.");
  return { ok: true };
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

/**
 * Turns a pending request into a catering event (enquiry) with a draft quotation: the customer is linked by name or
 * created if new, the days become the event's days and the quotation lines are pax x price per day plus the extra items.
 */
export async function approveQuotationRequest(requestId: string): Promise<Result> {
  try {
    return await approveRequest(requestId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not approve. Please try again." };
  }
}

async function approveRequest(requestId: string): Promise<Result> {
  const { supabase, userId } = await requireUser();
  const { data: r, error: readError } = await supabase.from("quotation_requests").select("*").eq("id", requestId).single();
  if (readError) throw readError;
  if (r.status !== "pending") throw new Error("This request has already been reviewed.");

  const days = (r.days as unknown as EventDay[]).map((d) => ({ ...d, mealTypes: d.mealTypes ?? [] }));
  const extras = r.extra_items as unknown as ExtraItem[];
  const submittedOn = r.created_at.slice(0, 10);

  // 1) the event (skipped when an earlier attempt already created it)
  let eventId = r.catering_event_id;
  if (!eventId) {
    const escaped = r.customer_name.replace(/[\\%_]/g, "\\$&");
    const { data: found } = await supabase.from("customers").select("id").eq("company_id", r.company_id).ilike("name", escaped).maybeSingle();
    let customerId = found?.id;
    if (!customerId) {
      const { data: created, error: customerError } = await supabase
        .from("customers")
        .insert({
          company_id: r.company_id,
          name: r.customer_name,
          contact_person: r.pic_name,
          phone: r.pic_phone,
          notes: `Created from a quotation request by sales agent ${r.sales_agent} on ${submittedOn}.`,
        })
        .select("id")
        .single();
      if (customerError) throw customerError;
      customerId = created.id;
    }

    const common = {
      companyId: r.company_id,
      customerId,
      eventName: r.event_name,
      eventType: r.event_type,
      location: r.location ?? undefined,
      picName: r.pic_name ?? undefined,
      picPhone: r.pic_phone ?? undefined,
      salesAgent: r.sales_agent,
      kitchenSetup: r.kitchen_setup ?? undefined,
      cateringSetup: r.catering_setup ?? undefined,
      eventDetails: `Requested by sales agent ${r.sales_agent} through the quotation form on ${submittedOn}.`,
      status: "enquiry",
    };
    const only = days.length === 1 ? days[0] : null;
    const event = await createEvent(
      only
        ? {
            ...common,
            eventDate: only.dayDate,
            eventTime: only.eventTime,
            setupTime: only.setupTime,
            paxCount: dayPax(only),
            mealTypes: only.mealTypes,
            serviceType: only.serviceType,
            servicePax: only.servicePax,
            secondServiceType: only.secondServiceType,
            secondServicePax: only.secondServicePax,
            pricePerPax: only.pricePerPax,
            menuDescription: only.menuDetails,
            remarks: [only.remarks, r.remarks].filter(Boolean).join("\n") || undefined,
          }
        : { ...common, eventDate: days[0].dayDate, remarks: r.remarks ?? undefined, days },
    );
    eventId = event.id;
    const { error: linkError } = await supabase.from("quotation_requests").update({ catering_event_id: eventId }).eq("id", requestId);
    if (linkError) throw linkError;
  }

  // 2) the draft quotation: one line per day (pax x price) plus the extra items
  const lines = [
    ...quotationSeedRows(days.length === 1 ? [] : days, {
      eventName: r.event_name,
      pax: days.length === 1 ? dayPax(days[0]) : null,
      pricePerPax: days.length === 1 ? days[0].pricePerPax ?? null : null,
    }),
    ...extras.map((i) => ({ itemName: i.itemName, quantity: i.quantity, unitPrice: i.unitPrice })),
  ];
  if (lines.length === 0) throw new Error("There is no priced line to put in the quotation.");
  const quotation = await createQuotation({
    companyId: r.company_id,
    eventId,
    quotationNumber: `Q-${Date.now().toString().slice(-6)}`,
    items: lines.map((l) => ({ ...l, discountPercent: 0 })),
  });

  const { error: updateError } = await supabase
    .from("quotation_requests")
    .update({ status: "approved", quotation_id: quotation.id, reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .eq("id", requestId);
  if (updateError) throw updateError;
  revalidatePath("/catering");
  revalidatePath("/catering/quotation-requests");
  return { ok: true, eventId };
}

export async function rejectQuotationRequest(requestId: string): Promise<Result> {
  try {
    const { supabase, userId } = await requireUser();
    const { error } = await supabase
      .from("quotation_requests")
      .update({ status: "rejected", reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("status", "pending");
    if (error) throw error;
    revalidatePath("/catering/quotation-requests");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not reject. Please try again." };
  }
}
