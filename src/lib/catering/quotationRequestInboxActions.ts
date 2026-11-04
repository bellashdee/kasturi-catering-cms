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
