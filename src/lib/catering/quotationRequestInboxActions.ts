"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { TRACKING_STATUS_LABEL, type TrackingInput } from "@/lib/catering/quotationRequest";

/**
 * Only the people on quotation_request_access (Ms. Nabilah, Mr. Adlan, Ms. Penny) may change a request. The database refuses
 * everyone else too (row level security); this check gives a readable message instead of a silent "nothing changed".
 */
async function requireInboxAccess() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: allowed } = await supabase.rpc("user_has_quotation_request_access");
  if (allowed !== true) throw new Error("You do not have access to the Quotation Request Inbox.");
  return { supabase, userId: user.id };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const date = (v: string, label: string) => {
  const s = v.trim();
  if (!s) return null;
  if (!DATE.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) throw new Error(`${label}: enter a valid date.`);
  return s;
};
const reference = (v: string, label: string) => {
  const s = v.trim().replace(/\s+/g, " ");
  if (s.length > 50) throw new Error(`${label}: at most 50 characters.`);
  return s || null;
};

/** Saves the tracking of one request (status, AutoCount numbers, dates, who handles it) and writes each change to its history. */
export async function updateRequestTracking(requestId: string, input: TrackingInput): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId } = await requireInboxAccess();
    if (!TRACKING_STATUS_LABEL[input.trackingStatus]) throw new Error("Choose a status from the list.");

    const next = {
      tracking_status: input.trackingStatus,
      autocount_quotation_no: reference(input.autocountQuotationNo, "AutoCount quotation number"),
      autocount_invoice_no: reference(input.autocountInvoiceNo, "AutoCount invoice number"),
      quotation_prepared_on: date(input.quotationPreparedOn, "Quotation preparation date"),
      sent_to_customer_on: date(input.sentToCustomerOn, "Date sent to customer"),
      customer_response_on: date(input.customerResponseOn, "Customer response date"),
      follow_up_on: date(input.followUpOn, "Follow-up date"),
      handled_by: input.handledBy || null,
    };

    const { data: before } = await supabase.from("quotation_requests").select("*").eq("id", requestId).maybeSingle();
    if (!before) throw new Error("This request was not found.");

    // the person handling it must be one of the people who can open the inbox
    const people = await inboxPeople(supabase);
    if (next.handled_by && !people.has(next.handled_by)) throw new Error("Choose the person handling the request from the list.");

    const LABEL: Record<keyof typeof next, string> = {
      tracking_status: "Status",
      autocount_quotation_no: "AutoCount quotation number",
      autocount_invoice_no: "AutoCount invoice number",
      quotation_prepared_on: "Quotation preparation date",
      sent_to_customer_on: "Date sent to customer",
      customer_response_on: "Customer response date",
      follow_up_on: "Follow-up date",
      handled_by: "Handled by",
    };
    const shown = (key: keyof typeof next, v: string | null) =>
      v === null ? null : key === "tracking_status" ? TRACKING_STATUS_LABEL[v] ?? v : key === "handled_by" ? people.get(v) ?? v : v;
    const changes = (Object.keys(next) as (keyof typeof next)[])
      .filter((k) => (before[k] ?? null) !== next[k])
      .map((k) => ({ request_id: requestId, changed_by: userId, field: LABEL[k], old_value: shown(k, before[k] ?? null), new_value: shown(k, next[k]) }));
    if (changes.length === 0) return {};

    const { data: updated, error } = await supabase
      .from("quotation_requests")
      .update({ ...next, updated_at: new Date().toISOString(), updated_by: userId })
      .eq("id", requestId)
      .select("id");
    if (error) throw error;
    if (!updated?.length) throw new Error("You do not have permission to do this.");
    const { error: historyError } = await supabase.from("quotation_request_history").insert(changes);
    if (historyError) throw historyError;

    revalidatePath("/catering/quotation-requests");
    revalidatePath(`/catering/quotation-requests/${requestId}`);
    return {};
  }, "Could not save. Please try again.");
}

/** The people who can open the inbox (id → name), read as one of them. */
async function inboxPeople(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Map<string, string>> {
  const { data } = await supabase.rpc("quotation_request_people");
  return new Map((data ?? []).map((p) => [p.user_id, p.full_name ?? "—"]));
}

/** An internal note on a request: only the inbox people see it, and it records who wrote it. */
export async function addRequestNote(requestId: string, body: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId } = await requireInboxAccess();
    const text = body.trim();
    if (!text) throw new Error("Write the note first.");
    if (text.length > 4000) throw new Error("A note can have at most 4000 characters.");
    const { error } = await supabase.from("quotation_request_notes").insert({ request_id: requestId, body: text, created_by: userId });
    if (error) throw error;
    await supabase.from("quotation_request_history").insert({ request_id: requestId, changed_by: userId, field: "Internal note", old_value: null, new_value: "Added a note" });
    revalidatePath(`/catering/quotation-requests/${requestId}`);
    return {};
  }, "Could not save the note. Please try again.");
}

/** Deletes one of your own notes (the history keeps that a note was deleted). */
export async function deleteRequestNote(noteId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId } = await requireInboxAccess();
    const { data: note } = await supabase.from("quotation_request_notes").select("request_id, created_by").eq("id", noteId).maybeSingle();
    if (!note) throw new Error("This note was not found.");
    if (note.created_by !== userId) throw new Error("You can only delete your own notes.");
    const { error } = await supabase.from("quotation_request_notes").delete().eq("id", noteId);
    if (error) throw error;
    await supabase.from("quotation_request_history").insert({ request_id: note.request_id, changed_by: userId, field: "Internal note", old_value: "A note", new_value: "Deleted" });
    revalidatePath(`/catering/quotation-requests/${note.request_id}`);
    return {};
  }, "Could not delete the note. Please try again.");
}

/** The details of a request that the inbox people can correct (the event days and menu stay as the agent sent them). */
export type RequestDetailsInput = {
  customerName: string;
  picName: string;
  picPhone: string;
  contactEmail: string;
  companyAddress: string;
  eventName: string;
  eventType: string;
  location: string;
  eventAddress: string;
  salesAgent: string;
  kitchenSetup: string;
  cateringSetup: string;
  remarks: string;
};

const DETAIL_COLUMNS: { key: keyof RequestDetailsInput; column: string; label: string; max: number; required?: boolean }[] = [
  { key: "customerName", column: "customer_name", label: "Customer / company", max: 200, required: true },
  { key: "picName", column: "pic_name", label: "Contact person (PIC)", max: 200 },
  { key: "picPhone", column: "pic_phone", label: "Contact number", max: 50 },
  { key: "contactEmail", column: "contact_email", label: "E-mail", max: 200 },
  { key: "companyAddress", column: "company_address", label: "Company address", max: 500 },
  { key: "eventName", column: "event_name", label: "Event name", max: 500, required: true },
  { key: "eventType", column: "event_type", label: "Event type", max: 50, required: true },
  { key: "location", column: "location", label: "Venue", max: 300 },
  { key: "eventAddress", column: "event_address", label: "Event address", max: 500 },
  { key: "salesAgent", column: "sales_agent", label: "Sales agent", max: 100 },
  { key: "kitchenSetup", column: "kitchen_setup", label: "Kitchen set-up", max: 4000 },
  { key: "cateringSetup", column: "catering_setup", label: "Catering set-up", max: 4000 },
  { key: "remarks", column: "remarks", label: "Remarks", max: 4000 },
];

/** Saves corrections to a request's customer and event details; every change goes to its history. */
export async function updateRequestDetails(requestId: string, input: RequestDetailsInput): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId } = await requireInboxAccess();
    const { data: before } = await supabase.from("quotation_requests").select("*").eq("id", requestId).maybeSingle();
    if (!before) throw new Error("This request was not found.");
    const row = before as unknown as Record<string, string | null>;

    const next: Record<string, string | null> = {};
    for (const f of DETAIL_COLUMNS) {
      const value = String(input[f.key] ?? "").trim();
      if (f.required && !value) throw new Error(`${f.label} cannot be empty.`);
      if (value.length > f.max) throw new Error(`${f.label}: at most ${f.max} characters.`);
      next[f.column] = value || null;
    }
    const changed = DETAIL_COLUMNS.filter((f) => (row[f.column] ?? null) !== next[f.column]);
    if (changed.length === 0) return {};

    const patch = Object.fromEntries(changed.map((f) => [f.column, next[f.column]]));
    const { data: updated, error } = await supabase
      .from("quotation_requests")
      .update({ ...patch, updated_at: new Date().toISOString(), updated_by: userId } as never)
      .eq("id", requestId)
      .select("id");
    if (error) throw error;
    if (!updated?.length) throw new Error("You do not have permission to do this.");
    const cut = (v: string | null) => (v && v.length > 300 ? `${v.slice(0, 300)}…` : v);
    const { error: historyError } = await supabase
      .from("quotation_request_history")
      .insert(changed.map((f) => ({ request_id: requestId, changed_by: userId, field: f.label, old_value: cut(row[f.column] ?? null), new_value: cut(next[f.column]) })));
    if (historyError) throw historyError;

    revalidatePath("/catering/quotation-requests");
    revalidatePath(`/catering/quotation-requests/${requestId}`);
    return {};
  }, "Could not save. Please try again.");
}

/** Deletes a request with its notes, history and attachments (the inbox people only; asked to confirm first on the page). */
export async function deleteQuotationRequest(requestId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireInboxAccess();
    const { data: files } = await supabase.from("quotation_request_files").select("storage_path").eq("request_id", requestId);
    const { data: deleted, error } = await supabase.from("quotation_requests").delete().eq("id", requestId).select("id");
    if (error) throw error;
    if (!deleted?.length) throw new Error("This request was not found, or you do not have permission to delete it.");
    const paths = (files ?? []).map((f) => f.storage_path).filter(Boolean);
    if (paths.length > 0) {
      const { error: storageError } = await supabase.storage.from("quotation-request-files").remove(paths);
      if (storageError) console.warn("Request deleted; its files could not be removed:", storageError.message);
    }
    revalidatePath("/catering/quotation-requests");
    return {};
  }, "Could not delete the request. Please try again.");
}
