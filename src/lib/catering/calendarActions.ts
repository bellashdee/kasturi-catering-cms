"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { updateEventStatus } from "@/lib/catering/actions";
import { validateTimes } from "@/lib/catering/validation";
import type { Database } from "@/lib/supabase/types";

type DayPatch = Database["public"]["Tables"]["catering_event_days"]["Update"];
type EventPatch = Database["public"]["Tables"]["catering_events"]["Update"];

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

function refresh(eventId?: string) {
  revalidatePath("/catering");
  revalidatePath("/catering/calendar");
  if (eventId) revalidatePath(`/catering/${eventId}`);
  revalidatePath("/kitchen");
  revalidatePath("/");
}

export type QuickEditInput = {
  eventId: string;
  /** the event day being edited, for an event with separate days */
  dayId: string | null;
  eventName: string;
  date: string;
  eventTime: string;
  setupTime: string;
  location: string;
  /** the guests of the day / event; ignored for an entry that has two service types (edited in the full form) */
  pax: number | null;
};

const dayTotal = (d: { service_pax: number; second_service_type: string | null; second_service_pax: number | null }) => d.service_pax + (d.second_service_type ? d.second_service_pax ?? 0 : 0);

/**
 * The quick edit of the calendar: name, date, times, venue and pax. A multi-day event changes the day that was edited and the
 * event's own start / end date, time and pax are worked out again from its days (the same rule as the full form).
 */
export async function quickUpdateEvent(input: QuickEditInput): Promise<ActionResult<{ notice: string | null }>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const name = input.eventName.trim();
    if (!name) throw new Error("Enter the event name.");
    if (name.length > 200) throw new Error("The event name is too long.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Select the date.");
    validateTimes({ setupTime: input.setupTime, eventTime: input.eventTime });
    if (input.pax !== null && !(Number.isInteger(input.pax) && input.pax >= 1 && input.pax <= 100000)) throw new Error("Enter the pax as a whole number (1 or more).");

    const { data: ev, error } = await supabase
      .from("catering_events")
      .select("id, company_id, event_name, event_date, event_time, setup_time, location, service_type, second_service_type, pax_count")
      .eq("id", input.eventId)
      .maybeSingle();
    if (error) throw error;
    if (!ev) throw new Error("This event was not found (it may have been deleted).");
    const before = `${ev.event_name} · ${ev.event_date} ${ev.event_time?.slice(0, 5) ?? ""}`;
    let dateChanged = false;

    if (input.dayId) {
      const { data: day } = await supabase.from("catering_event_days").select("*").eq("id", input.dayId).eq("catering_event_id", ev.id).maybeSingle();
      if (!day) throw new Error("This event day was not found (it may have been changed).");
      dateChanged = day.day_date !== input.date;
      const patch: DayPatch = { day_date: input.date, event_time: input.eventTime, setup_time: input.setupTime };
      if (input.pax !== null && !day.second_service_type) patch.service_pax = input.pax;
      const { data: saved, error: dayError } = await supabase.from("catering_event_days").update(patch).eq("id", input.dayId).select("id");
      if (dayError) {
        if (dayError.code === "23505") throw new Error("Another day of this event already uses that date.");
        throw dayError;
      }
      if (!saved || saved.length !== 1) throw new Error("The change was not saved. You may not have permission.");
      // the event's own dates, time and pax follow its days
      const { data: days } = await supabase.from("catering_event_days").select("day_date, event_time, setup_time, service_pax, second_service_type, second_service_pax").eq("catering_event_id", ev.id).order("day_date");
      const list = days ?? [];
      const first = list[0];
      const last = list[list.length - 1];
      const { error: evError } = await supabase
        .from("catering_events")
        .update({
          event_name: name,
          location: input.location.trim() || null,
          event_date: first.day_date,
          end_date: last.day_date !== first.day_date ? last.day_date : null,
          event_time: first.event_time,
          setup_time: first.setup_time,
          pax_count: Math.max(...list.map(dayTotal)),
        })
        .eq("id", ev.id);
      if (evError) throw evError;
    } else {
      dateChanged = ev.event_date !== input.date;
      const patch: EventPatch = {
        event_name: name,
        location: input.location.trim() || null,
        event_date: input.date,
        event_time: input.eventTime,
        setup_time: input.setupTime,
      };
      if (input.pax !== null && !ev.second_service_type) {
        patch.pax_count = input.pax;
        if (ev.service_type) patch.service_pax = input.pax;
      }
      const { data: saved, error: evError } = await supabase.from("catering_events").update(patch).eq("id", ev.id).select("id");
      if (evError) throw evError;
      if (!saved || saved.length !== 1) throw new Error("The change was not saved. You may not have permission.");
    }

    await recordAudit({ companyId: ev.company_id, relatedTable: "catering_events", relatedId: ev.id, action: "calendar_edit", previousValue: before, newValue: `${name} · ${input.date} ${input.eventTime}${input.pax !== null ? ` · ${input.pax} pax` : ""}` });

    // a date that moved does not move the work already made for the old date
    let notice: string | null = null;
    if (dateChanged) {
      const [{ count: orders }, { count: deliveries }] = await Promise.all([
        supabase.from("production_orders").select("id", { count: "exact", head: true }).eq("catering_event_id", ev.id),
        supabase.from("deliveries").select("id", { count: "exact", head: true }).eq("catering_event_id", ev.id),
      ]);
      if ((orders ?? 0) + (deliveries ?? 0) > 0) notice = "The date was changed. The production orders and deliveries already made for this event keep their old date: update them in Kitchen and Operation Management.";
    }
    refresh(ev.id);
    return { notice };
  }, "Could not save the change. Please try again.");
}

/** Cancels an event (it stays in the system as Cancelled). Returns the status it had, so Undo can put it back. */
export async function cancelEventFromCalendar(eventId: string): Promise<ActionResult<{ previousStatus: string }>> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: ev } = await supabase.from("catering_events").select("status").eq("id", eventId).maybeSingle();
    if (!ev) throw new Error("This event was not found (it may have been deleted).");
    if (ev.status === "cancelled") throw new Error("This event is already cancelled.");
    await updateEventStatus(eventId, "cancelled");
    refresh(eventId);
    return { previousStatus: ev.status };
  }, "Could not cancel the event. Please try again.");
}

/** Puts an event back to a status (used by Undo after a cancel, and to bring a cancelled event back). */
export async function restoreEventStatus(eventId: string, status: string): Promise<ActionResult> {
  return runAction(async () => {
    if (!["enquiry", "quoted", "confirmed", "in_production", "delivered", "completed"].includes(status)) throw new Error("Choose a valid status.");
    await requireUser();
    await updateEventStatus(eventId, status);
    refresh(eventId);
    return {};
  }, "Could not restore the event. Please try again.");
}

/**
 * Deletes an event for good (with its quotations, days and set-up). Only an admin of the company can, and only an event that has
 * not started real work: no production orders, deliveries, costs or revenue. Anything else is cancelled, never deleted.
 */
export async function deleteEventFromCalendar(eventId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { data: ev } = await supabase.from("catering_events").select("id, company_id, event_name, event_date, status, pax_count").eq("id", eventId).maybeSingle();
    if (!ev) throw new Error("This event was not found (it may already be deleted).");
    const { data: isAdmin } = await supabase.rpc("user_is_company_admin", { target_company_id: ev.company_id });
    if (isAdmin !== true) throw new Error("Only an admin of the company can delete an event. You can cancel it instead.");
    if (!["enquiry", "quoted", "cancelled"].includes(ev.status)) throw new Error("A confirmed event cannot be deleted. Cancel it first.");

    const counts = await Promise.all([
      supabase.from("production_orders").select("id", { count: "exact", head: true }).eq("catering_event_id", eventId),
      supabase.from("deliveries").select("id", { count: "exact", head: true }).eq("catering_event_id", eventId),
      supabase.from("event_cost_entries").select("id", { count: "exact", head: true }).eq("catering_event_id", eventId),
      supabase.from("event_revenue_entries").select("id", { count: "exact", head: true }).eq("catering_event_id", eventId),
      supabase.from("event_budgets").select("id", { count: "exact", head: true }).eq("catering_event_id", eventId),
    ]);
    if (counts.some((c) => (c.count ?? 0) > 0)) throw new Error("This event already has production orders, deliveries, costs or revenue recorded, so it cannot be deleted. Cancel it instead.");

    // there is no delete policy for events: the checks above are the permission, the delete itself uses the service role
    const { error } = await createAdminClient().from("catering_events").delete().eq("id", eventId).eq("company_id", ev.company_id);
    if (error) throw new Error("The event could not be deleted. Cancel it instead.");
    await recordAudit({ companyId: ev.company_id, relatedTable: "catering_events", relatedId: eventId, action: "deleted", previousValue: `${ev.event_name} · ${ev.event_date} · ${ev.status}${ev.pax_count ? ` · ${ev.pax_count} pax` : ""}` });
    refresh();
    return {};
  }, "Could not delete the event. Please try again.");
}
