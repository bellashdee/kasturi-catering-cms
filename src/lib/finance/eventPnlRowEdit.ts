import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { REVENUE_ADDITIONS, round2 } from "@/lib/finance/eventPnl";

type DB = SupabaseClient<Database>;

/**
 * Whether a figure of an event can be changed straight from the Event P&L list: only when the figure is made of at most one entry typed in
 * by hand (not a customer or supplier invoice, not the Catering costing sheet). Otherwise it is changed entry by entry on the event's P&L page.
 */
export type FigureSlot = { editable: true; entryId: string | null } | { editable: false; reason: string };
export type FigureKey = "revenue" | "direct" | "additional";
export type RowEditInfo = { customerId: string | null } & Record<FigureKey, FigureSlot> & { entrySums: Record<FigureKey, number> };

const LINKED_COST = "This cost comes from a supplier invoice: change it on the event's P&L page.";
export const OTHER_SOURCE = "Includes costs from a supplier invoice or the Catering costing sheet: change it on the event's P&L page.";

function slotOf(entries: { id: string; linked: boolean }[], linkedReason: string): FigureSlot {
  if (entries.length === 0) return { editable: true, entryId: null };
  if (entries.length > 1) return { editable: false, reason: `Made of ${entries.length} entries: change them on the event's P&L page.` };
  if (entries[0].linked) return { editable: false, reason: linkedReason };
  return { editable: true, entryId: entries[0].id };
}

const sum = (rows: { amount: number | string }[]) => round2(rows.reduce((t, r) => t + Number(r.amount ?? 0), 0));

export async function eventPnlRowEditInfo(supabase: DB, eventIds: string[]): Promise<Map<string, RowEditInfo>> {
  const out = new Map<string, RowEditInfo>();
  if (eventIds.length === 0) return out;
  const [events, revenue, costs, sheets] = await Promise.all([
    supabase.from("catering_events").select("id, customer_id").in("id", eventIds),
    supabase.from("event_revenue_entries").select("id, catering_event_id, entry_type, amount, customer_invoice_id").in("catering_event_id", eventIds),
    supabase.from("event_cost_entries").select("id, catering_event_id, cost_class, cost_basis, amount, supplier_invoice_id").in("catering_event_id", eventIds),
    supabase.from("event_costing").select("catering_event_id, food_cost, ingredient_cost, staff_cost, transport_cost, equipment_cost, other_cost").in("catering_event_id", eventIds),
  ]);
  for (const r of [events, revenue, costs, sheets]) if (r.error) throw r.error;
  for (const e of events.data ?? []) {
    const rev = (revenue.data ?? []).filter((r) => r.catering_event_id === e.id);
    const actual = (costs.data ?? []).filter((c) => c.catering_event_id === e.id && (c.cost_basis ?? "actual") === "actual");
    const direct = actual.filter((c) => c.cost_class === "direct");
    const additional = actual.filter((c) => c.cost_class === "additional");
    const sheetUsed = (sheets.data ?? []).some(
      (s) => s.catering_event_id === e.id && [s.food_cost, s.ingredient_cost, s.staff_cost, s.transport_cost, s.equipment_cost, s.other_cost].some((v) => Number(v ?? 0) !== 0),
    );
    const deduction = rev.some((r) => !(REVENUE_ADDITIONS as readonly string[]).includes(r.entry_type));
    out.set(e.id, {
      customerId: e.customer_id,
      revenue: deduction
        ? { editable: false, reason: "Includes a discount, refund or credit note: change it on the event's P&L page." }
        : slotOf(rev.map((r) => ({ id: r.id, linked: !!r.customer_invoice_id })), "This revenue comes from a customer invoice: change it on the event's P&L page."),
      direct: sheetUsed ? { editable: false, reason: OTHER_SOURCE } : slotOf(direct.map((c) => ({ id: c.id, linked: !!c.supplier_invoice_id })), LINKED_COST),
      additional: slotOf(additional.map((c) => ({ id: c.id, linked: !!c.supplier_invoice_id })), LINKED_COST),
      entrySums: { revenue: sum(rev), direct: sum(direct), additional: sum(additional) },
    });
  }
  return out;
}

/**
 * The slot as the list shows it: a figure that is not exactly the sum of its entries (for example supplier invoices counted by their
 * AutoCount invoice number) cannot be typed over from the list.
 */
export function shownSlot(info: RowEditInfo | undefined, key: FigureKey, shown: number): FigureSlot | null {
  if (!info) return null;
  const slot = info[key];
  if (slot.editable && Math.abs(info.entrySums[key] - shown) >= 0.005) return { editable: false, reason: OTHER_SOURCE };
  return slot;
}
