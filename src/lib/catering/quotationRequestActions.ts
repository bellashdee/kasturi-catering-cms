"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import { EVENT_TYPE_LABEL, MAX_EVENT_DAYS, MEAL_TYPE_LABEL, SALES_AGENTS, SERVICE_TYPE_LABEL } from "@/lib/catering/constants";
import { dayPax, quotationSeedRows, type EventDay } from "@/lib/catering/days";
import { INTAKE_COMPANIES, INTAKE_HOURLY_LIMIT } from "@/lib/catering/intake";
import {
  MAX_EXTRA_ITEMS,
  additionalServiceLines,
  describeSecondChoice,
  type AdditionalServices,
  type ExtraItem,
  type QuotationRequestInput,
  type SecondChoice,
} from "@/lib/catering/quotationRequest";
import { validateDays } from "@/lib/catering/validation";
import { MAX_SECOND_MENUS, secondMenusOf } from "@/lib/catering/days";
import { createEvent, createQuotation } from "@/lib/catering/actions";
import { QUOTATION_NOTIFY_EMAIL, SITE_URL } from "@/lib/catering/intake";
import { escapeHtml, sendNotificationEmail } from "@/lib/notify/email";
import { dayAmount } from "@/lib/catering/days";
import { formatPrice } from "@/lib/format";

type Result = { ok: boolean; error?: string; eventId?: string };

const clean = (s: string | undefined, max = 500) => {
  const v = s?.trim();
  if (!v) return null;
  if (v.length > max) throw new Error("One of the fields is too long.");
  return v;
};

/** Keeps only the known day fields, trimmed and size-limited, so nothing else can be smuggled into the saved request. */
function sanitizeDay(d: EventDay, index: number): EventDay {
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
    secondMenus: sanitizeSecondMenus(d, index),
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

/** A day's optional second menus (at most 5): an empty one is ignored, a started one needs a menu, pax and service type. */
function sanitizeSecondMenus(d: EventDay, index: number): SecondChoice[] | undefined {
  const given = secondMenusOf(d);
  if (given.length > MAX_SECOND_MENUS) throw new Error(`Day ${index + 1}: at most ${MAX_SECOND_MENUS} second menus a day.`);
  const kept = given.map((c, n) => sanitizeSecondChoice(c, `Day ${index + 1}: second menu ${n + 1}`)).filter((c): c is SecondChoice => c !== null);
  return kept.length > 0 ? kept : undefined;
}

/** One second menu: ignored when nothing is filled in, otherwise it needs a menu, pax and service type. */
function sanitizeSecondChoice(c: SecondChoice | undefined, label: string): SecondChoice | null {
  if (!c) return null;
  const menu = clean(c.menu, 3000);
  const touched = menu || c.pax !== undefined || (c.mealTypes?.length ?? 0) > 0 || c.serviceType || c.pricePerMeal !== undefined;
  if (!touched) return null;
  if (!menu) throw new Error(`${label}: enter the menu.`);
  if (c.pax === undefined || !Number.isInteger(c.pax) || c.pax <= 0) throw new Error(`${label}: state the qty pax.`);
  if (!SERVICE_TYPE_LABEL[c.serviceType]) throw new Error(`${label}: select the service type.`);
  const mealTypes = c.mealTypes ?? [];
  if (mealTypes.some((m) => !MEAL_TYPE_LABEL[m])) throw new Error(`${label}: select a valid meal type.`);
  if (c.pricePerMeal !== undefined && !(c.pricePerMeal >= 0)) throw new Error(`${label}: the price per meal cannot be negative.`);
  return { menu, pax: c.pax, mealTypes, serviceType: c.serviceType, pricePerMeal: c.pricePerMeal };
}

/** The answered additional services: Yes (with an optional price), No, or included in the food price (nothing is added). No price is compulsory. */
function sanitizeAdditional(a: AdditionalServices | undefined): AdditionalServices {
  // compulsory: every additional requirement must be answered Yes or No (not left out)
  if (!a || typeof a.equipmentHandling !== "boolean") throw new Error("Additional requirement: answer Equipment handling (Yes, No or Included in the food price).");
  if (typeof a.staffServing !== "boolean") throw new Error("Additional requirement: answer Staff serving (Yes, No or Included in the food price).");
  if (typeof a.transportation !== "boolean") throw new Error("Additional requirement: answer Transportation (Yes, No or Included in the food price).");
  if (typeof a.domeSet !== "boolean") throw new Error("Additional requirement: answer Dome set (Yes, No or Included in the food price).");
  const price = (v: number | undefined, label: string, required: boolean) => {
    if (v === undefined) {
      if (required) throw new Error(`${label}: enter the price (RM).`);
      return undefined;
    }
    if (!(v >= 0)) throw new Error(`${label}: the price cannot be negative.`);
    return v;
  };
  const one = (yes: boolean, included: boolean | undefined, v: number | undefined, label: string) => ({
    yes,
    included: yes && included === true,
    price: yes && included !== true ? price(v, label, false) : undefined,
  });
  const e = one(a.equipmentHandling, a.equipmentHandlingIncluded, a.equipmentHandlingPrice, "Equipment handling");
  const s = one(a.staffServing, a.staffServingIncluded, a.staffServingPrice, "Staff serving");
  const t = one(a.transportation, a.transportationIncluded, a.transportationPrice, "Transportation");
  const d = one(a.domeSet, a.domeSetIncluded, a.domeSetPrice, "Dome set");
  return {
    equipmentHandling: e.yes,
    equipmentHandlingIncluded: e.included,
    equipmentHandlingPrice: e.price,
    staffServing: s.yes,
    staffServingIncluded: s.included,
    staffServingPrice: s.price,
    transportation: t.yes,
    transportationIncluded: t.included,
    transportationPrice: t.price,
    domeSet: d.yes,
    domeSetIncluded: d.included,
    domeSetPrice: d.price,
  };
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
  // the location and the person in charge (name and contact number) are compulsory on this form
  if (!clean(input.location, 300)) throw new Error("Enter the event location.");
  if (!clean(input.picName, 200)) throw new Error("Enter the PIC (person in charge).");
  const picPhone = clean(input.picPhone, 50);
  if (!picPhone) throw new Error("Enter the PIC contact number.");
  const phoneDigits = picPhone.replace(/\D/g, "").length;
  if (phoneDigits < 7 || phoneDigits > 15 || !/^[+\d][\d\s()+-]*$/.test(picPhone)) throw new Error("The PIC contact number is not valid.");

  if (!Array.isArray(input.days) || input.days.length === 0) throw new Error("Add at least one event day.");
  if (input.days.length > MAX_EVENT_DAYS) throw new Error(`At most ${MAX_EVENT_DAYS} days.`);
  const days = input.days.map((d, i) => sanitizeDay(d, i)).sort((a, b) => a.dayDate.localeCompare(b.dayDate));
  validateDays(days);
  days.forEach((d, i) => {
    if (d.mealTypes.length === 0) throw new Error(`Day ${i + 1}: select at least one meal type.`);
  });
  const additional = sanitizeAdditional(input.additional);
  const extraItems = [...additionalServiceLines(additional), ...sanitizeExtras(input.extraItems ?? [])];
  if (extraItems.length > MAX_EXTRA_ITEMS) throw new Error(`At most ${MAX_EXTRA_ITEMS} extra items.`);
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
    additional: additional as unknown as Json,
  });
  if (error) throw new Error("Could not save. Please try again.");

  // tell the office; the request is already saved, so a missing or failing email never fails the form
  try {
    const total = days.reduce((t, d) => t + dayAmount(d), 0) + extraItems.reduce((t, i) => t + i.quantity * i.unitPrice, 0);
    const result = await notifyNewQuotationRequest({
      companyName: company.name,
      salesAgent: input.salesAgent,
      customerName,
      eventName,
      days,
      total,
    });
    if (!result.sent) console.warn("Quotation request saved; email not sent:", result.reason);
  } catch (err) {
    console.warn("Quotation request saved; email step failed:", err instanceof Error ? err.message : err);
  }
  return { ok: true };
}

async function notifyNewQuotationRequest(r: { companyName: string; salesAgent: string; customerName: string; eventName: string; days: EventDay[]; total: number }) {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? SITE_URL).replace(/\/$/, "");
  const reviewUrl = `${siteUrl}/catering/quotation-requests`;
  const to = process.env.QUOTATION_NOTIFY_EMAIL ?? QUOTATION_NOTIFY_EMAIL;
  const first = r.days[0].dayDate;
  const last = r.days[r.days.length - 1].dayDate;
  const dates = first === last ? first : `${first} to ${last} (${r.days.length} days)`;
  const totalText = r.total > 0 ? formatPrice(r.total) : "no price entered";

  const text = [
    `New quotation request from ${r.salesAgent} (${r.companyName})`,
    "",
    `Event: ${r.eventName}`,
    `Customer: ${r.customerName}`,
    `Date: ${dates}`,
    `Estimated total: ${totalText}`,
    "",
    `Review and approve it here: ${reviewUrl}`,
    "Nothing is saved to the system until you approve it.",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1a2433">
<h3 style="margin:0 0 8px">New quotation request from ${escapeHtml(r.salesAgent)}</h3>
<p style="margin:0 0 4px;color:#5a6577">${escapeHtml(r.companyName)}</p>
<table style="border-collapse:collapse;margin:12px 0">
<tr><td style="padding:3px 12px 3px 0;color:#5a6577">Event</td><td><b>${escapeHtml(r.eventName)}</b></td></tr>
<tr><td style="padding:3px 12px 3px 0;color:#5a6577">Customer</td><td>${escapeHtml(r.customerName)}</td></tr>
<tr><td style="padding:3px 12px 3px 0;color:#5a6577">Date</td><td>${escapeHtml(dates)}</td></tr>
<tr><td style="padding:3px 12px 3px 0;color:#5a6577">Estimated total</td><td>${escapeHtml(totalText)}</td></tr>
</table>
<p><a href="${reviewUrl}" style="background:#1d6fd6;color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none;font-weight:bold">Review and approve</a></p>
<p style="color:#5a6577;font-size:12px">Nothing is saved to the system until you approve it.</p>
</div>`;

  return sendNotificationEmail({ to, subject: `New quotation request: ${r.eventName} (${r.salesAgent})`, text, html });
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
  // a day's second menus (alternative menus) are kept in that day's remarks; they are not part of the quotation
  const withSecondChoice = (d: EventDay): EventDay => {
    const menus = secondMenusOf(d);
    return {
      ...d,
      remarks:
        [d.remarks, ...menus.map((m, n) => describeSecondChoice(m, { meal: MEAL_TYPE_LABEL, service: SERVICE_TYPE_LABEL }, menus.length > 1 ? n + 1 : undefined))]
          .filter(Boolean)
          .join("\n\n") || undefined,
    };
  };
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
            remarks: [withSecondChoice(only).remarks, r.remarks].filter(Boolean).join("\n\n") || undefined,
          }
        : { ...common, eventDate: days[0].dayDate, remarks: r.remarks ?? undefined, days: days.map(withSecondChoice) },
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
