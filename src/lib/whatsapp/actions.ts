"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { untyped } from "@/lib/kitchenPurchase/shared";
import { recordAudit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { todayInMalaysia } from "@/lib/format";
import { EVENT_TYPE_LABEL, JDT_CUSTOMER_ID, JDT_EVENT_TYPE, SIGNATURE_COMPANY_ID } from "@/lib/catering/constants";
import { INTAKE_COMPANIES } from "@/lib/catering/intake";
import type { EventDay, SecondChoice } from "@/lib/catering/days";
import { analyseWithAi } from "@/lib/whatsapp/analyse";
import { sessionPax, type WaCategory, type WaResult, type WaSession } from "@/lib/whatsapp/types";
import { createSnackRequestFromImport } from "@/lib/snack/actions";

const MAX_MESSAGE = 20_000;
const SIGNATURE = INTAKE_COMPANIES["signature-solution"];

/** Only the Quotation Request people (Admin / Management) import WhatsApp messages, and only for Signature Solution. */
async function requireImporter() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: allowed } = await supabase.rpc("user_has_quotation_request_access");
  if (allowed !== true) throw new Error("Only Admin / Management (the Quotation Request people) can import WhatsApp messages.");
  return { supabase, userId: user.id };
}

const isUuid = (v: string | undefined | null) => !!v && /^[0-9a-f-]{36}$/i.test(v);

export type AnalyseResult = { importId: string; result: WaResult };

/**
 * Reads a pasted WhatsApp message with AI and keeps the message (with who imported it and what the AI read) as a draft import.
 * Analysing again (e.g. as another category) updates the same draft.
 */
export async function analyseWhatsappMessage(message: string, opts: { importId?: string; category?: WaCategory } = {}): Promise<ActionResult<AnalyseResult>> {
  return runAction(async () => {
    const { supabase } = await requireImporter();
    const text = message.trim();
    if (!text) throw new Error("Paste the WhatsApp message first.");
    if (text.length > MAX_MESSAGE) throw new Error("The message is too long. Paste one instruction at a time.");
    const result = await analyseWithAi(text, todayInMalaysia(), opts.category);
    const db = untyped(supabase);
    if (isUuid(opts.importId)) {
      const { data, error } = await db
        .from("whatsapp_imports")
        .update({ original_message: text, category: result.category, ai_category: opts.category ? undefined : result.category, ai_result: result, edited_result: null })
        .eq("id", opts.importId)
        .eq("status", "draft")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (data) return { importId: data.id as string, result };
    }
    const { data, error } = await db
      .from("whatsapp_imports")
      .insert({ company_id: SIGNATURE_COMPANY_ID, original_message: text, category: result.category, ai_category: result.category, ai_result: result })
      .select("id")
      .single();
    if (error) throw error;
    revalidatePath("/catering/quotation-requests/whatsapp");
    return { importId: data.id as string, result };
  }, "Could not analyse the message. Please try again.");
}

/** Keeps the Admin's edits as a draft (the information may still be incomplete). */
export async function saveWhatsappDraft(importId: string, result: WaResult): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireImporter();
    if (!isUuid(importId)) throw new Error("Analyse the message first.");
    const { error } = await untyped(supabase).from("whatsapp_imports").update({ edited_result: result, category: result.category }).eq("id", importId).eq("status", "draft");
    if (error) throw error;
    revalidatePath("/catering/quotation-requests/whatsapp");
    return {};
  }, "Could not save the draft. Please try again.");
}

/** Sets a draft aside (it is kept, never deleted, for the record). */
export async function discardWhatsappImport(importId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireImporter();
    const { error } = await untyped(supabase).from("whatsapp_imports").update({ status: "discarded" }).eq("id", importId).eq("status", "draft");
    if (error) throw error;
    revalidatePath("/catering/quotation-requests/whatsapp");
    return {};
  }, "Could not set the draft aside.");
}

// ---------- A. quotation request ----------

function sessionExtras(s: WaSession) {
  return {
    sessionName: s.name || undefined,
    paxBreakdown: s.breakdown.length > 0 ? s.breakdown.map((l) => ({ category: l.category.trim(), pax: l.pax && l.pax > 0 ? l.pax : null })).filter((l) => l.category) : undefined,
    deliveryDate: s.deliveryDate || undefined,
    deliveryTime: s.deliveryTime || undefined,
    deliveryLocation: s.deliveryLocation.trim() || undefined,
    deliveryInstructions: s.deliveryInstructions.trim() || undefined,
    specialInstructions: s.specialInstructions.trim() || undefined,
  };
}

function toRequestDays(r: WaResult): EventDay[] {
  const q = r.quotation;
  return q.days
    .filter((d) => d.date)
    .map((d) => {
      const [main, ...others] = d.sessions.length > 0 ? d.sessions : [];
      const day: EventDay = {
        dayDate: d.date,
        eventTime: main?.mealTime || q.eventTime || undefined,
        mealTypes: main?.mealTypes ?? [],
        serviceType: main?.serviceType ?? "",
        servicePax: main ? sessionPax(main) ?? undefined : undefined,
        menuDetails: main?.menu.trim() || undefined,
        ...(main ? sessionExtras(main) : {}),
        secondMenus:
          others.length > 0
            ? others.map(
                (s): SecondChoice => ({
                  menu: s.menu.trim(),
                  pax: sessionPax(s) ?? undefined,
                  mealTypes: s.mealTypes,
                  serviceType: s.serviceType,
                  eventTime: s.mealTime || undefined,
                  ...sessionExtras(s),
                }),
              )
            : undefined,
      };
      return day;
    })
    .sort((a, b) => a.dayDate.localeCompare(b.dayDate));
}

async function submitQuotation(importId: string, r: WaResult, userId: string): Promise<{ requestId: string; linkedEventId: string | null }> {
  const q = r.quotation;
  const days = toRequestDays(r);
  if (days.length === 0) throw new Error("Enter the event date before submitting (or Save as Draft).");
  if (!EVENT_TYPE_LABEL[q.eventType]) throw new Error("Choose the event category.");
  const eventName = q.eventName.trim() || (q.matchDetails.trim() ? `JDT Match – ${q.matchDetails.trim()}` : "");
  if (!eventName) throw new Error("Enter the event name.");
  const remarks = [
    q.matchDetails.trim() && `Match: ${q.matchDetails.trim()}`,
    q.kickOff && `Kick-off: ${q.kickOff}`,
    q.eventTime && `Event time: ${q.eventTime}`,
    `Budget: ${q.budget.trim() || "Not Provided"}`,
    q.specialInstructions.trim() && `Special instructions: ${q.specialInstructions.trim()}`,
    "Imported from a WhatsApp message (the original message is kept with this request).",
  ]
    .filter(Boolean)
    .join("\n");

  const admin = createAdminClient();
  // a JDT match day that is already on the calendar as a date-only event: the request is linked to that event (no second event)
  let linkedEventId: string | null = null;
  if (q.eventType === JDT_EVENT_TYPE && days.length === 1) {
    const { data: same } = await admin
      .from("catering_events")
      .select("id")
      .eq("company_id", SIGNATURE_COMPANY_ID)
      .eq("customer_id", JDT_CUSTOMER_ID)
      .eq("event_date", days[0].dayDate)
      .neq("status", "cancelled")
      .not("event_name", "ilike", "%AWAY%");
    if ((same ?? []).length === 1) linkedEventId = same![0].id;
  }

  const { data: saved, error } = await untyped(admin)
    .from("quotation_requests")
    .insert({
      company_id: SIGNATURE_COMPANY_ID,
      sales_agent: SIGNATURE.fixedAgent ?? null,
      customer_name: q.customerName.trim() || SIGNATURE.fixedCustomer || "JDT FC SDN. BHD.",
      event_name: eventName.slice(0, 500),
      event_type: q.eventType,
      location: q.venue.trim() || null,
      remarks,
      days,
      extra_items: [],
      catering_event_id: linkedEventId,
      source: "whatsapp",
      whatsapp_import_id: importId,
    })
    .select("id, request_code")
    .single();
  if (error) throw new Error(`Could not save the quotation request (${error.message}).`);
  await recordAudit({ companyId: SIGNATURE_COMPANY_ID, relatedTable: "quotation_requests", relatedId: saved.id as string, action: "created", newValue: `${eventName} · from WhatsApp` });
  void userId;
  return { requestId: saved.id as string, linkedEventId };
}

// ---------- B. JDT match dates ----------

async function submitMatches(r: WaResult): Promise<{ eventIds: string[]; skipped: string[] }> {
  if (r.matches.length === 0) throw new Error("There is no match to save.");
  const missing = r.matches.findIndex((m) => !m.date);
  if (missing >= 0) throw new Error(`Match ${missing + 1}: enter the date.`);
  const { createDateOnlyEvent } = await import("@/lib/catering/dateOnlyActions");
  const eventIds: string[] = [];
  const skipped: string[] = [];
  for (const m of r.matches) {
    const away = m.homeAway === "away";
    const details = [away ? "AWAY:" : "", m.matchDetails.trim() || "JDT match", m.competition.trim() ? `(${m.competition.trim()})` : "", away ? "(no catering)" : ""].filter(Boolean).join(" ");
    const res = await createDateOnlyEvent(
      {
        eventType: JDT_EVENT_TYPE,
        eventName: "JDT Match",
        matchDetails: details,
        date: m.date,
        time: m.kickOff || undefined,
        venue: m.venue || undefined,
        status: "date_confirmed",
        remarks: [away ? "Away match, for information only: no catering." : "Menu and pax pending from JDT.", m.remarks.trim(), "Imported from a WhatsApp message."].filter(Boolean).join(" "),
      },
      !!m.saveAnyway,
    );
    if (!res.ok) throw new Error(`${m.date}: ${res.error}`);
    if (res.duplicates?.length) skipped.push(`${m.date} (already on the calendar: ${res.duplicates.map((d) => d.name).join(", ")})`);
    else eventIds.push(res.id);
  }
  return { eventIds, skipped };
}

export type SubmitResult = { requestId?: string; linkedEventId?: string | null; eventIds?: string[]; skipped?: string[]; snackRequestId?: string };

/** Submits the reviewed information into the right module: a quotation request, date-only JDT events, or a JDT training snack request. */
export async function submitWhatsappImport(importId: string, result: WaResult): Promise<ActionResult<SubmitResult>> {
  return runAction(async () => {
    const { supabase, userId } = await requireImporter();
    if (!isUuid(importId)) throw new Error("Analyse the message first.");
    const db = untyped(supabase);
    const { data: row, error: readError } = await db.from("whatsapp_imports").select("id, status").eq("id", importId).maybeSingle();
    if (readError || !row) throw new Error("This import was not found.");
    if (row.status !== "draft") throw new Error("This message was already submitted.");

    let out: SubmitResult = {};
    const links: Record<string, unknown> = {};
    if (result.category === "quotation") {
      const r = await submitQuotation(importId, result, userId);
      out = r;
      links.quotation_request_id = r.requestId;
      if (r.linkedEventId) links.event_ids = [r.linkedEventId];
    } else if (result.category === "jdt_match") {
      const r = await submitMatches(result);
      out = r;
      links.event_ids = r.eventIds;
    } else {
      const id = await createSnackRequestFromImport(importId, result.snack);
      out = { snackRequestId: id };
      links.snack_request_id = id;
    }
    const { error } = await db
      .from("whatsapp_imports")
      .update({ ...links, edited_result: result, category: result.category, status: "submitted", submitted_by: userId, submitted_at: new Date().toISOString() })
      .eq("id", importId);
    if (error) console.warn("Submitted, but the import record could not be updated:", error.message);
    revalidatePath("/catering/quotation-requests");
    revalidatePath("/catering/quotation-requests/whatsapp");
    revalidatePath("/catering/calendar");
    return out;
  }, "Could not submit. Please try again.");
}
