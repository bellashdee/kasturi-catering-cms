"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import { EVENT_TYPE_LABEL, MAX_EVENT_DAYS, MEAL_TYPE_LABEL, ACTIVE_SALES_AGENTS, SERVICE_TYPE_LABEL } from "@/lib/catering/constants";
import { normalizeMenu, type EventDay } from "@/lib/catering/days";
import { INTAKE_COMPANIES, INTAKE_HOURLY_LIMIT } from "@/lib/catering/intake";
import {
  ATTACHMENT_BUCKET,
  ATTACHMENT_EXTENSIONS,
  ATTACHMENT_MAX_BYTES,
  MAX_ATTACHMENTS,
  MAX_EXTRA_ITEMS,
  REQUIREMENT_FIELDS,
  additionalServiceLines,
  attachmentExtension,
  type AdditionalServices,
  type ExtraItem,
  type QuotationRequestInput,
  type RequestAttachment,
  type RequestRequirements,
  type SecondChoice,
} from "@/lib/catering/quotationRequest";
import { validateDays } from "@/lib/catering/validation";
import { MAX_SECOND_MENUS, secondMenusOf } from "@/lib/catering/days";
import { QUOTATION_NOTIFY_EMAIL, SITE_URL } from "@/lib/catering/intake";
import { escapeHtml, sendNotificationEmail } from "@/lib/notify/email";
import { dayAmount } from "@/lib/catering/days";
import { formatPrice } from "@/lib/format";

type Result = { ok: boolean; error?: string; requestCode?: string; warning?: string };

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
    endTime: sanitizeTime(d.endTime, `Day ${index + 1}: the event end time`),
    mealTypes: d.mealTypes ?? [],
    serviceType: d.serviceType,
    servicePax: d.servicePax,
    secondServiceType: d.secondServiceType || undefined,
    secondServicePax: d.secondServiceType ? d.secondServicePax : undefined,
    menuDetails: clean(normalizeMenu(d.menuDetails), 3000) ?? undefined,
    pricePerPax: d.pricePerPax,
    remarks: clean(d.remarks, 1000) ?? undefined,
    secondMenus: sanitizeSecondMenus(d, index),
  };
}

function sanitizeTime(v: string | undefined, label: string): string | undefined {
  const t = v?.trim();
  if (!t) return undefined;
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(t)) throw new Error(`${label} is not a valid time.`);
  return t.slice(0, 5);
}

/** The menu and catering requirements: each one optional, trimmed and size-limited; menu options is a whole number from 1 to 20. */
function sanitizeRequirements(r: RequestRequirements | undefined): RequestRequirements {
  const out: RequestRequirements = {};
  if (r?.menuOptions !== undefined) {
    if (!Number.isInteger(r.menuOptions) || r.menuOptions < 1 || r.menuOptions > 20) throw new Error("Number of menu options: enter a whole number from 1 to 20.");
    out.menuOptions = r.menuOptions;
  }
  for (const f of REQUIREMENT_FIELDS) {
    const v = clean(r?.[f.key], 1000);
    if (v) out[f.key] = v;
  }
  return out;
}

/** The folder of a company's request attachments; a file the browser names must be inside it. */
const attachmentFolder = (companyId: string) => companyId;

/**
 * Public (no login), before sending: a one-time permission to upload ONE attachment into this company's folder of the private
 * attachments bucket. The type and size are checked here; nothing else can be written, and only the inbox people can read it.
 */
export async function requestAttachmentUpload(companySlug: string, file: { name: string; size: number }): Promise<{ ok: boolean; error?: string; path?: string; token?: string }> {
  try {
    const company = INTAKE_COMPANIES[companySlug];
    if (!company) throw new Error("This link is not valid.");
    const ext = attachmentExtension(file.name);
    if (!ATTACHMENT_EXTENSIONS.includes(ext)) throw new Error(`${file.name}: attach a PDF, a photo, a Word or an Excel file.`);
    if (!(file.size > 0) || file.size > ATTACHMENT_MAX_BYTES) throw new Error(`${file.name}: each file must be smaller than 10 MB.`);
    const path = `${attachmentFolder(company.id)}/${crypto.randomUUID()}.${ext}`;
    const { data, error } = await createAdminClient().storage.from(ATTACHMENT_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new Error("Could not prepare the upload. Please try again.");
    return { ok: true, path, token: data.token };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not prepare the upload." };
  }
}

/** Each attachment must really be in the company's folder and not too big (the browser's word is not enough). */
async function checkAttachments(admin: ReturnType<typeof createAdminClient>, companyId: string, files: RequestAttachment[] | undefined): Promise<RequestAttachment[]> {
  const list = files ?? [];
  if (list.length > MAX_ATTACHMENTS) throw new Error(`At most ${MAX_ATTACHMENTS} attachments.`);
  const folder = attachmentFolder(companyId);
  const checked: RequestAttachment[] = [];
  for (const f of list) {
    if (!f.path?.startsWith(`${folder}/`) || f.path.includes("..")) throw new Error("An attachment is not valid. Please attach it again.");
    const fileName = f.path.slice(folder.length + 1);
    const { data: found } = await admin.storage.from(ATTACHMENT_BUCKET).list(folder, { search: fileName, limit: 5 });
    const object = found?.find((o) => o.name === fileName);
    if (!object) throw new Error(`${f.name}: the file was not uploaded. Please attach it again.`);
    const size = Number((object.metadata as { size?: number } | null)?.size ?? 0);
    if (size > ATTACHMENT_MAX_BYTES) {
      await admin.storage.from(ATTACHMENT_BUCKET).remove([f.path]);
      throw new Error(`${f.name}: each file must be smaller than 10 MB.`);
    }
    checked.push({ path: f.path, name: clean(f.name, 200) ?? fileName, mime: clean(f.mime, 100) ?? undefined, size });
  }
  return checked;
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
  const count = (n: number | undefined, message: string) => {
    if (!(n !== undefined && Number.isInteger(n) && n >= 1 && n <= 1000)) throw new Error(message);
    return n;
  };
  // delivery and equipment handling as one lump sum: one answer and one price for both
  const lumpSum = a.deliveryEquipmentLumpSum === true;
  const e = one(a.equipmentHandling, a.equipmentHandlingIncluded, lumpSum ? a.lumpSumPrice : a.equipmentHandlingPrice, lumpSum ? "Delivery & equipment handling" : "Equipment handling");
  const s = one(a.staffServing, a.staffServingIncluded, a.staffServingPrice, "Staff serving");
  const staff = s.yes ? count(a.staffServingQuantity, "Staff serving: enter how many staff.") : undefined;
  const t = lumpSum ? e : one(a.transportation, a.transportationIncluded, a.transportationPrice, "Transportation");
  const trips = !lumpSum && t.yes ? count(a.transportationTrips, "Transportation: enter how many trips.") : undefined;
  const d = one(a.domeSet, a.domeSetIncluded, a.domeSetPrice, "Dome set");
  const sets = d.yes ? count(a.domeSetQuantity, "Dome set: enter how many sets.") : undefined;
  return {
    deliveryEquipmentLumpSum: lumpSum,
    lumpSumPrice: lumpSum ? e.price : undefined,
    equipmentHandling: e.yes,
    equipmentHandlingIncluded: e.included,
    equipmentHandlingPrice: lumpSum ? undefined : e.price,
    staffServing: s.yes,
    staffServingIncluded: s.included,
    staffServingQuantity: staff,
    staffServingPrice: s.price,
    transportation: t.yes,
    transportationIncluded: t.included,
    transportationTrips: trips,
    transportationPrice: lumpSum ? undefined : t.price,
    domeSet: d.yes,
    domeSetIncluded: d.included,
    domeSetQuantity: sets,
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

  if (!ACTIVE_SALES_AGENTS.includes(input.salesAgent)) throw new Error("Select your name from the sales agent list.");
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
  const contactEmail = clean(input.contactEmail, 200);
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new Error("The e-mail address is not valid.");
  const requirements = sanitizeRequirements(input.requirements);

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
  const attachments = await checkAttachments(admin, company.id, input.attachments);

  const { data: saved, error } = await admin.from("quotation_requests").insert({
    company_id: company.id,
    sales_agent: input.salesAgent,
    customer_name: customerName,
    event_name: eventName,
    event_type: input.eventType,
    location: clean(input.location, 300),
    pic_name: clean(input.picName, 200),
    pic_phone: clean(input.picPhone, 50),
    contact_email: contactEmail,
    company_address: clean(input.companyAddress, 500),
    event_address: clean(input.eventAddress, 500),
    requirements: requirements as unknown as Json,
    kitchen_setup: clean(input.kitchenSetup, 2000),
    catering_setup: clean(input.cateringSetup, 2000),
    remarks: clean(input.remarks, 2000),
    days: days as unknown as Json,
    extra_items: extraItems as unknown as Json,
    additional: additional as unknown as Json,
  }).select("id, request_code").single();
  if (error) throw new Error("Could not save. Please try again.");
  const requestCode = saved.request_code ?? undefined;

  // the request is saved; a file that cannot be linked is reported, not a reason to send the whole request again
  let warning: string | undefined;
  if (attachments.length > 0) {
    const { error: filesError } = await admin.from("quotation_request_files").insert(
      attachments.map((f) => ({ request_id: saved.id, storage_path: f.path, file_name: f.name, mime_type: f.mime ?? null, size_bytes: f.size })),
    );
    if (filesError) warning = "The request was sent, but the attachments could not be saved. Please send the files to the office directly.";
  }

  // tell the office; the request is already saved, so a missing or failing email never fails the form
  try {
    const total = days.reduce((t, d) => t + dayAmount(d), 0) + extraItems.reduce((t, i) => t + i.quantity * i.unitPrice, 0);
    const result = await notifyNewQuotationRequest({
      requestCode,
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
  return { ok: true, requestCode, warning };
}

async function notifyNewQuotationRequest(r: { requestCode?: string; companyName: string; salesAgent: string; customerName: string; eventName: string; days: EventDay[]; total: number }) {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? SITE_URL).replace(/\/$/, "");
  const reviewUrl = `${siteUrl}/catering/quotation-requests`;
  const to = process.env.QUOTATION_NOTIFY_EMAIL ?? QUOTATION_NOTIFY_EMAIL;
  const first = r.days[0].dayDate;
  const last = r.days[r.days.length - 1].dayDate;
  const dates = first === last ? first : `${first} to ${last} (${r.days.length} days)`;
  const totalText = r.total > 0 ? formatPrice(r.total) : "no price entered";

  const text = [
    `New quotation request ${r.requestCode ?? ""} from ${r.salesAgent} (${r.companyName})`,
    "",
    `Event: ${r.eventName}`,
    `Customer: ${r.customerName}`,
    `Date: ${dates}`,
    `Estimated total: ${totalText}`,
    "",
    `Open it in the Quotation Request Inbox: ${reviewUrl}`,
    "The request does not create an event; prepare the quotation in AutoCount.",
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
<p><a href="${reviewUrl}" style="background:#1d6fd6;color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none;font-weight:bold">Open the request</a></p>
<p style="color:#5a6577;font-size:12px">The request does not create an event; prepare the quotation in AutoCount.</p>
</div>`;

  return sendNotificationEmail({ to, subject: `New quotation request ${r.requestCode ?? ""}: ${r.eventName} (${r.salesAgent})`, text, html });
}

