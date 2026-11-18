"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";
import { runAction, type ActionResult } from "@/lib/actionResult";
import { updateEventStatus } from "@/lib/catering/actions";
import { EVENT_STATUS_LABEL } from "@/lib/catering/constants";
import { EVENT_PNL_COMPANY_NAMES, round2 } from "@/lib/finance/eventPnl";
import { eventPnlRowEditInfo, type FigureKey } from "@/lib/finance/eventPnlRowEdit";

/** The Edit / Save / Cancel / Delete of one event on the Event P&L list. Same access as the page: Finance / Admin of the company and the Quotation Request Inbox people. */

type Supa = Awaited<ReturnType<typeof createClient>>;

async function loadEvent(eventId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: event } = await supabase
    .from("catering_events")
    .select("id, company_id, event_name, event_reference, event_date, end_date, status, customer_id, customers(name), companies(name)")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) throw new Error("This event was not found (it may already be deleted).");
  if (!(EVENT_PNL_COMPANY_NAMES as readonly string[]).includes(event.companies?.name ?? "")) throw new Error("Event P&L is only for Signature Solution and Kasturi Indah events.");
  const { data: ok } = await supabase.rpc("user_can_manage_event_pnl", { target_company_id: event.company_id });
  if (ok !== true) throw new Error("Only Finance / Admin users of this company, Ms. Nabilah, Mr. Adlan and Ms. Penny can change events on the Event P&L.");
  return { supabase, userId: user.id, event };
}

function refresh(eventId?: string) {
  revalidatePath("/finance/event-pnl");
  if (eventId) revalidatePath(`/finance/event-pnl/${eventId}`);
  revalidatePath("/catering");
  if (eventId) revalidatePath(`/catering/${eventId}`);
}

/** The customers of an event's company, for the customer list of the Edit form. */
export async function listPnlEventCustomers(eventId: string): Promise<ActionResult<{ customers: { id: string; name: string }[] }>> {
  return runAction(async () => {
    const { supabase, event } = await loadEvent(eventId);
    const { data, error } = await supabase.from("customers").select("id, name").eq("company_id", event.company_id).order("name").limit(5000);
    if (error) throw error;
    return { customers: data ?? [] };
  }, "Could not load the customers.");
}

/** A figure as the list showed it and as typed. */
export type FigureChange = { shown: number; value: number };

export type PnlRowEdit = {
  eventId: string;
  eventName: string;
  eventDate: string;
  status: string;
  customerId: string | null;
  /** null = not typed on the list (that figure is changed on the event's P&L page). */
  netRevenue: FigureChange | null;
  directCosts: FigureChange | null;
  additional: FigureChange | null;
};

const rm = (n: number) => `RM ${n.toFixed(2)}`;
const LIST_NOTE = "Entered on the Event P&L list";

export async function savePnlEventRow(input: PnlRowEdit): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, userId, event } = await loadEvent(input.eventId);
    const name = input.eventName.trim();
    if (!name) throw new Error("Enter the event name.");
    if (name.length > 200) throw new Error("The event name is too long.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.eventDate)) throw new Error("Select the event date.");
    if (!EVENT_STATUS_LABEL[input.status]) throw new Error("Choose a valid status.");
    for (const f of [input.netRevenue, input.directCosts, input.additional]) {
      if (f !== null && (!Number.isFinite(f.value) || f.value < 0 || !Number.isFinite(f.shown))) throw new Error("Amounts must be 0 or more.");
    }

    // ------------------------------------------------------------ details
    const before: string[] = [];
    const after: string[] = [];
    const patch: { event_name?: string; event_date?: string; customer_id?: string | null } = {};
    if (name !== event.event_name) {
      patch.event_name = name;
      before.push(`Event: ${event.event_name}`);
      after.push(`Event: ${name}`);
    }
    if (input.eventDate !== event.event_date) {
      const { count } = await supabase.from("catering_event_days").select("id", { count: "exact", head: true }).eq("catering_event_id", event.id);
      if ((count ?? 0) > 0) throw new Error("This event has separate days: change its dates in Catering (Edit event).");
      if (event.end_date && input.eventDate > event.end_date) throw new Error("The event date cannot be after the event's end date. Change it in Catering (Edit event).");
      patch.event_date = input.eventDate;
      before.push(`Date: ${event.event_date}`);
      after.push(`Date: ${input.eventDate}`);
    }
    const customerId = input.customerId || null;
    if (customerId !== event.customer_id) {
      let newName = "—";
      if (customerId) {
        const { data: customer } = await supabase.from("customers").select("id, name").eq("id", customerId).eq("company_id", event.company_id).maybeSingle();
        if (!customer) throw new Error("Choose a customer of the event's company.");
        newName = customer.name;
      }
      patch.customer_id = customerId;
      before.push(`Customer: ${event.customers?.name ?? "—"}`);
      after.push(`Customer: ${newName}`);
    }
    if (Object.keys(patch).length > 0) {
      const { data: saved, error } = await supabase.from("catering_events").update(patch).eq("id", event.id).select("id");
      if (error) throw error;
      if (!saved || saved.length !== 1) throw new Error("The change was not saved. You may not have permission.");
      await recordAudit({ companyId: event.company_id, relatedTable: "catering_events", relatedId: event.id, action: "edited", previousValue: before.join(" · "), newValue: `${after.join(" · ")} (Event P&L list)` });
    }
    // a status change also makes the kitchen production order and the delivery, exactly as in Catering
    if (input.status !== event.status) await updateEventStatus(event.id, input.status);

    // ------------------------------------------------------------ figures
    const wanted: [FigureKey, string, FigureChange | null][] = [
      ["revenue", "Net revenue", input.netRevenue],
      ["direct", "Direct costs", input.directCosts],
      ["additional", "Additional expenses", input.additional],
    ];
    const changed = wanted.filter((w): w is [FigureKey, string, FigureChange] => w[2] !== null && Math.abs(round2(w[2].value) - round2(w[2].shown)) >= 0.005);
    if (changed.length > 0) {
      const info = (await eventPnlRowEditInfo(supabase, [event.id])).get(event.id);
      if (!info) throw new Error("This event was not found (it may already be deleted).");
      const entryDate = patch.event_date ?? event.event_date;
      for (const [key, label, f] of changed) {
        const value = round2(f.value);
        const slot = info[key];
        if (!slot.editable) throw new Error(`${label}: ${slot.reason}`);
        if (Math.abs(info.entrySums[key] - round2(f.shown)) >= 0.005) throw new Error(`${label}: the figure has changed or includes other costs. Reload the page, or change it on the event's P&L page.`);
        await writeFigure(supabase, key, slot.entryId, value, { companyId: event.company_id, eventId: event.id, entryDate, userId });
        await recordAudit({
          companyId: event.company_id,
          relatedTable: "event_pnl",
          relatedId: event.id,
          action: "figure_edited",
          previousValue: `${event.event_name} · ${label} ${rm(info.entrySums[key])}`,
          newValue: `${label} ${rm(value)} (Event P&L list)`,
        });
      }
    }

    refresh(event.id);
    return {};
  }, "Could not save the event. Please try again.");
}

async function must(q: PromiseLike<{ error: unknown }>) {
  const { error } = await q;
  if (error) throw error;
}

/** One figure typed on the list: its single hand-typed entry is changed (or removed at 0), or one entry is added. */
async function writeFigure(supabase: Supa, key: FigureKey, entryId: string | null, value: number, ctx: { companyId: string; eventId: string; entryDate: string; userId: string }) {
  const stamp = { updated_by: ctx.userId, updated_at: new Date().toISOString() };
  if (key === "revenue") {
    if (entryId && value === 0) return must(supabase.from("event_revenue_entries").delete().eq("id", entryId));
    if (entryId) return must(supabase.from("event_revenue_entries").update({ amount: value, ...stamp }).eq("id", entryId));
    if (value > 0) {
      return must(
        supabase.from("event_revenue_entries").insert({ company_id: ctx.companyId, catering_event_id: ctx.eventId, entry_type: "sales", description: LIST_NOTE, amount: value, entry_date: ctx.entryDate, created_by: ctx.userId }),
      );
    }
    return;
  }
  if (entryId && value === 0) return must(supabase.from("event_cost_entries").delete().eq("id", entryId));
  if (entryId) return must(supabase.from("event_cost_entries").update({ amount: value, ...stamp }).eq("id", entryId));
  if (value > 0) {
    return must(
      supabase.from("event_cost_entries").insert({
        company_id: ctx.companyId,
        catering_event_id: ctx.eventId,
        cost_class: key,
        cost_type: key === "direct" ? "others" : "other_additional",
        cost_basis: "actual",
        description: LIST_NOTE,
        amount: value,
        cost_date: ctx.entryDate,
        payment_status: "unpaid",
        created_by: ctx.userId,
      }),
    );
  }
}

/**
 * Deletes an event from the Event P&L list. Refused while anything with money (customer invoice, revenue, cost, budget, costing sheet)
 * or real work (production order, delivery, attendance) is linked; its quotations, days, staff and equipment go with it.
 */
export async function deletePnlEvent(eventId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, event } = await loadEvent(eventId);
    const head = { count: "exact" as const, head: true };
    const checks: [string, PromiseLike<{ count: number | null }>][] = [
      ["customer invoice(s)", supabase.from("customer_invoices").select("id", head).eq("catering_event_id", eventId)],
      ["revenue entry(ies)", supabase.from("event_revenue_entries").select("id", head).eq("catering_event_id", eventId)],
      ["cost entry(ies)", supabase.from("event_cost_entries").select("id", head).eq("catering_event_id", eventId)],
      ["budget", supabase.from("event_budgets").select("id", head).eq("catering_event_id", eventId)],
      ["costing sheet", supabase.from("event_costing").select("id", head).eq("catering_event_id", eventId)],
      ["production order(s)", supabase.from("production_orders").select("id", head).eq("catering_event_id", eventId)],
      ["delivery(ies)", supabase.from("deliveries").select("id", head).eq("catering_event_id", eventId)],
      ["staff attendance record(s)", supabase.from("event_attendance").select("id", head).eq("event_id", eventId)],
    ];
    const counts = await Promise.all(checks.map(async ([, q]) => (await q).count ?? 0));
    const used = checks.map(([label], i) => (counts[i] > 0 ? `${counts[i]} ${label}` : null)).filter(Boolean);
    if (used.length > 0) throw new Error(`This event cannot be deleted: it has ${used.join(", ")}. Remove those first on the event's page, or set the event to Cancelled instead.`);

    // the delete policy allows company admins only; the check above (the same rule as the page) is the permission, so the delete uses the service role
    const { data: removed, error } = await createAdminClient().from("catering_events").delete().eq("id", eventId).eq("company_id", event.company_id).select("id");
    if (error || !removed?.length) throw new Error("The event could not be deleted. Set it to Cancelled instead.");
    await recordAudit({
      companyId: event.company_id,
      relatedTable: "catering_events",
      relatedId: eventId,
      action: "deleted",
      previousValue: `${event.event_reference ?? ""} ${event.event_name} · ${event.event_date} · ${event.status} · ${event.customers?.name ?? "no customer"}`.trim(),
      newValue: "Deleted from the Event P&L list",
    });
    refresh();
    revalidatePath("/catering/calendar");
    return {};
  }, "Could not delete the event. Please try again.");
}
