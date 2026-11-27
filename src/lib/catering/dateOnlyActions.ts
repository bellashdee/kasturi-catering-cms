"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { DATE_ONLY_STATUSES, JDT_CUSTOMER_ID, JDT_EVENT_TYPE, SIGNATURE_COMPANY_ID } from "@/lib/catering/constants";

export type DateOnlyEventInput = {
  /** "football_jdt" (JDT match) or another event category */
  eventType: string;
  /** "JDT Match" by default */
  eventName: string;
  /** e.g. "JDT FC vs KL CITY FC" */
  matchDetails?: string;
  date: string;
  /** kick-off / event time "HH:MM", optional */
  time?: string;
  venue?: string;
  status: string;
  remarks?: string;
  /** the record of the WhatsApp message it came from, if any */
  whatsappImportId?: string;
};

export type DateOnlyDuplicate = { id: string; name: string; status: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** The name saved on the event: "JDT Match – JDT FC vs KL CITY FC". */
export async function dateOnlyEventName(eventName: string, matchDetails?: string) {
  const base = eventName.trim() || "JDT Match";
  const detail = matchDetails?.trim();
  return detail ? `${base} – ${detail}` : base;
}

async function requireCreator() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: allowed } = await supabase.rpc("user_has_quotation_request_access");
  if (allowed !== true) throw new Error("Only the people with Quotation Request access (Admin / Management) can add events.");
  return supabase;
}

/** Events of the same customer already on that date (to avoid a second record of the same match). */
export async function findSameDayJdtEvents(date: string): Promise<DateOnlyDuplicate[]> {
  if (!DATE_RE.test(date)) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("catering_events")
    .select("id, event_name, status")
    .eq("company_id", SIGNATURE_COMPANY_ID)
    .eq("customer_id", JDT_CUSTOMER_ID)
    .eq("event_date", date)
    .neq("status", "cancelled");
  return (data ?? []).map((e) => ({ id: e.id, name: e.event_name, status: e.status }));
}

async function createDateOnlyWork(input: DateOnlyEventInput, allowSameDay: boolean): Promise<{ id: string; duplicates?: DateOnlyDuplicate[] }> {
  const supabase = await requireCreator();
  if (!DATE_RE.test(input.date) || Number.isNaN(Date.parse(`${input.date}T00:00:00Z`))) throw new Error("Choose the date.");
  if (!DATE_ONLY_STATUSES.includes(input.status)) throw new Error("Choose Date Confirmed or Details Pending.");
  if (input.time && !TIME_RE.test(input.time)) throw new Error("Check the time.");
  const jdt = input.eventType === JDT_EVENT_TYPE;
  if (jdt && !allowSameDay) {
    const same = await findSameDayJdtEvents(input.date);
    if (same.length > 0) return { id: "", duplicates: same };
  }
  const name = await dateOnlyEventName(input.eventName, input.matchDetails);
  const { data, error } = await supabase
    .from("catering_events")
    .insert({
      company_id: SIGNATURE_COMPANY_ID,
      customer_id: jdt ? JDT_CUSTOMER_ID : null,
      event_name: name,
      event_date: input.date,
      event_time: input.time || null,
      location: input.venue?.trim() || null,
      event_type: input.eventType || JDT_EVENT_TYPE,
      status: input.status as "date_confirmed" | "details_pending",
      meal_types: [],
      remarks: input.remarks?.trim() || null,
    })
    .select("id")
    .single();
  if (error) throw error;
  await recordAudit({ companyId: SIGNATURE_COMPANY_ID, relatedTable: "catering_events", relatedId: data.id, action: "created", newValue: `${name} · ${input.date} · date only` });
  revalidatePath("/catering");
  revalidatePath("/catering/calendar");
  revalidatePath("/bulletin");
  revalidatePath("/reports");
  return { id: data.id };
}

/**
 * Saves a date-only event of Signature Solution: only the name, date, category and status are needed; the menu, pax, budget and
 * costing stay empty until they come in. A JDT match on a date that already has a JDT event is not saved twice unless confirmed.
 */
export async function createDateOnlyEvent(input: DateOnlyEventInput, allowSameDay = false): Promise<ActionResult<{ id: string; duplicates?: DateOnlyDuplicate[] }>> {
  return runAction(() => createDateOnlyWork(input, allowSameDay), "Could not save the date. Please try again.");
}
