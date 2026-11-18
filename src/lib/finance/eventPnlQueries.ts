import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { monthDateRange } from "@/lib/finance/constants";
import {
  budgetVsActual,
  computeEventPnl,
  dataFlagsFor,
  EVENT_PNL_COMPANY_NAMES,
  totalEventPnl,
  type Budget,
  type DataFlag,
  type EventPnl,
} from "@/lib/finance/eventPnl";
import { autoCountCostsOf, autoCountSupplierInvoices } from "@/lib/finance/autocountCosts";

type DB = SupabaseClient<Database>;

/**
 * Companies (of those given) whose Event P&L the user may see and keep: Finance / Admin of the company, or one of the Quotation Request
 * Inbox people (Ms. Nabilah, Mr. Adlan, Ms. Penny) who works in it. The database applies the same rule.
 */
export async function eventPnlCompanyIds(supabase: DB, companyIds: string[]): Promise<string[]> {
  const flags = await Promise.all(
    companyIds.map(async (id) => {
      const { data } = await supabase.rpc("user_can_manage_event_pnl", { target_company_id: id });
      return [id, data === true] as const;
    }),
  );
  return flags.filter(([, ok]) => ok).map(([id]) => id);
}

/** The two companies this module covers, with their ids. */
export async function eventPnlCompanies(supabase: DB) {
  const { data } = await supabase.from("companies").select("id, name").in("name", [...EVENT_PNL_COMPANY_NAMES]);
  return data ?? [];
}

export type EventPnlFilters = { year: number; month: number; search?: string; customer?: string; status?: string };

export type EventPnlRow = {
  id: string;
  company_id: string;
  companyName: string;
  eventReference: string | null;
  eventName: string;
  eventDate: string;
  customerName: string | null;
  salesAgent: string | null;
  status: string;
  pax: number | null;
  pnl: EventPnl;
  flags: DataFlag[];
  budget: ReturnType<typeof budgetVsActual>;
};

type SheetRow = { food_cost: number; ingredient_cost: number; staff_cost: number; transport_cost: number; equipment_cost: number; other_cost: number };

function combineSheets(rows: SheetRow[]) {
  if (rows.length === 0) return null;
  const sum = (k: keyof SheetRow) => rows.reduce((t, r) => t + Number(r[k] ?? 0), 0);
  return { food_cost: sum("food_cost"), ingredient_cost: sum("ingredient_cost"), staff_cost: sum("staff_cost"), transport_cost: sum("transport_cost"), equipment_cost: sum("equipment_cost"), other_cost: sum("other_cost") };
}

/** Events with an event date inside [start, end], each calculated once from its own entries. */
async function loadRows(supabase: DB, companyIds: string[], start: string, end: string, filters: Pick<EventPnlFilters, "search" | "customer" | "status"> & { salesAgent?: string }): Promise<EventPnlRow[]> {
  if (companyIds.length === 0) return [];
  let query = supabase
    .from("catering_events")
    .select("id, company_id, event_name, event_reference, event_date, status, pax_count, sales_agent, customers(name), companies(name)")
    .in("company_id", companyIds)
    .gte("event_date", start)
    .lte("event_date", end)
    .order("event_date", { ascending: true });
  if (filters.status) query = query.eq("status", filters.status as Database["public"]["Enums"]["event_status"]);
  if (filters.salesAgent) query = query.eq("sales_agent", filters.salesAgent);
  if (filters.search) {
    const s = filters.search.replace(/[%,()]/g, " ").trim();
    if (s) query = query.or(`event_name.ilike.%${s}%,event_reference.ilike.%${s}%`);
  }
  const { data: events, error } = await query;
  if (error) throw error;

  let list = events ?? [];
  if (filters.customer?.trim()) {
    const c = filters.customer.trim().toLowerCase();
    list = list.filter((e) => (e.customers?.name ?? "").toLowerCase().includes(c));
  }
  if (list.length === 0) return [];
  const ids = list.map((e) => e.id);

  const [revenue, costs, sheets, budgets, fromAutoCount] = await Promise.all([
    supabase.from("event_revenue_entries").select("catering_event_id, entry_type, amount").in("catering_event_id", ids),
    supabase.from("event_cost_entries").select("catering_event_id, cost_class, cost_type, amount, cost_basis").in("catering_event_id", ids),
    supabase.from("event_costing").select("catering_event_id, food_cost, ingredient_cost, staff_cost, transport_cost, equipment_cost, other_cost").in("catering_event_id", ids),
    supabase.from("event_budgets").select("catering_event_id, budget_revenue, budget_direct_costs, budget_additional_costs").in("catering_event_id", ids),
    // supplier invoices keyed in with the AutoCount invoice number of the event count as its direct costs straight away
    autoCountSupplierInvoices(supabase, ids),
  ]);
  for (const r of [revenue, costs, sheets, budgets]) if (r.error) throw r.error;

  return list.map((e) => {
    const pnl = computeEventPnl(
      (revenue.data ?? []).filter((r) => r.catering_event_id === e.id),
      [...(costs.data ?? []).filter((c) => c.catering_event_id === e.id), ...autoCountCostsOf(fromAutoCount, e.id)],
      combineSheets((sheets.data ?? []).filter((s) => s.catering_event_id === e.id)),
    );
    const budget = (budgets.data ?? []).find((b) => b.catering_event_id === e.id) as Budget | undefined;
    return {
      id: e.id,
      company_id: e.company_id,
      companyName: e.companies?.name ?? "—",
      eventReference: e.event_reference,
      eventName: e.event_name,
      eventDate: e.event_date,
      customerName: e.customers?.name ?? null,
      salesAgent: e.sales_agent,
      status: e.status,
      pax: e.pax_count,
      pnl,
      flags: dataFlagsFor(pnl, e.status),
      budget: budgetVsActual(pnl, budget ?? null),
    };
  });
}

/** One row per event with an event date from `start` to `end` (YYYY-MM-DD): the Event Management report (month, quarter or year). */
export async function listEventPnlRange(
  supabase: DB,
  companyIds: string[],
  start: string,
  end: string,
  filters: { customer?: string; status?: string; salesAgent?: string } = {},
): Promise<EventPnlRow[]> {
  return loadRows(supabase, companyIds, start, end, filters);
}

/** One row per event of the month (by event date). */
export async function listEventPnl(supabase: DB, companyIds: string[], filters: EventPnlFilters): Promise<EventPnlRow[]> {
  const { start, end } = monthDateRange(filters.year, filters.month);
  return loadRows(supabase, companyIds, start, end, filters);
}

export type MonthPoint = { key: string; label: string; revenue: number; directCosts: number; netProfit: number; margin: number | null; events: number };

/** The last `count` months up to and including the chosen one, for the trend and previous-month comparison (same company scope, no filters). */
export async function eventPnlTrend(supabase: DB, companyIds: string[], year: number, month: number, count = 6): Promise<MonthPoint[]> {
  const months: { y: number; m: number }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    months.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 });
  }
  const first = monthDateRange(months[0].y, months[0].m).start;
  const last = monthDateRange(months[months.length - 1].y, months[months.length - 1].m).end;
  const rows = await loadRows(supabase, companyIds, first, last, {});
  return months.map(({ y, m }) => {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const inMonth = rows.filter((r) => r.eventDate.startsWith(key));
    const t = totalEventPnl(inMonth.map((r) => r.pnl));
    return { key, label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }), revenue: t.netRevenue, directCosts: t.directCosts, netProfit: t.netProfit, margin: t.margin, events: t.events };
  });
}

export type ReviewItem = { id: string; label: string; detail: string; href?: string };

/**
 * Transactions that cannot be placed on an event with confidence are listed for a person to decide — never assigned automatically.
 * - customer invoices of the two companies dated in the month that are not linked to any event
 * - invoices linked to an event but not counted as revenue yet (an issued invoice is not revenue until it is recorded)
 */
export async function eventPnlReviewItems(supabase: DB, companyIds: string[], year: number, month: number): Promise<{ unlinked: ReviewItem[]; notCounted: ReviewItem[] }> {
  if (companyIds.length === 0) return { unlinked: [], notCounted: [] };
  const { start, end } = monthDateRange(year, month);
  const { data: invoices } = await supabase
    .from("customer_invoices")
    .select("id, invoice_number, invoice_date, amount, status, catering_event_id, customers(name), companies(name)")
    .in("company_id", companyIds)
    .gte("invoice_date", start)
    .lte("invoice_date", end);
  const list = invoices ?? [];
  const linked = list.filter((i) => i.catering_event_id);
  const counted = new Set(
    ((await supabase.from("event_revenue_entries").select("customer_invoice_id").in("customer_invoice_id", linked.map((i) => i.id).length ? linked.map((i) => i.id) : ["00000000-0000-0000-0000-000000000000"])).data ?? []).map((r) => r.customer_invoice_id),
  );
  const money = (n: number) => `RM ${Number(n).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return {
    unlinked: list
      .filter((i) => !i.catering_event_id)
      .map((i) => ({ id: i.id, label: `${i.invoice_number} · ${i.customers?.name ?? "—"} · ${i.companies?.name ?? ""}`, detail: `${money(i.amount)} (${i.status}) — not linked to any event, so not in any event P&L.`, href: `/finance/invoices/${i.id}` })),
    notCounted: linked
      .filter((i) => !counted.has(i.id))
      .map((i) => ({ id: i.id, label: `${i.invoice_number} · ${i.customers?.name ?? "—"}`, detail: `${money(i.amount)} (${i.status}) — linked to an event but not recorded as revenue yet.`, href: `/finance/event-pnl/${i.catering_event_id}` })),
  };
}

export async function getEventPnlDetail(supabase: DB, eventId: string) {
  const { data: event, error } = await supabase
    .from("catering_events")
    .select("id, company_id, event_name, event_reference, event_date, status, pax_count, event_type, location, customers(name), companies(name)")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw error;
  if (!event) return null;

  const [revenue, costs, sheets, invoices, budget, supplierInvoices, fromAutoCount] = await Promise.all([
    supabase.from("event_revenue_entries").select("*").eq("catering_event_id", eventId).order("entry_date").order("created_at"),
    supabase.from("event_cost_entries").select("*").eq("catering_event_id", eventId).order("cost_date").order("created_at"),
    supabase.from("event_costing").select("food_cost, ingredient_cost, staff_cost, transport_cost, equipment_cost, other_cost").eq("catering_event_id", eventId),
    supabase.from("customer_invoices").select("id, invoice_number, invoice_date, amount, tax_amount, status, description").eq("catering_event_id", eventId).order("invoice_date"),
    supabase.from("event_budgets").select("*").eq("catering_event_id", eventId).maybeSingle(),
    supabase.from("supplier_invoices").select("id, invoice_number, invoice_date, amount, status, suppliers(name), supplier_invoice_items(item_name, uom, quantity, line_total)").eq("company_id", event.company_id).order("invoice_date", { ascending: false }).limit(60),
    autoCountSupplierInvoices(supabase, [eventId]),
  ]);
  for (const r of [revenue, costs, sheets, invoices, budget, supplierInvoices]) if (r.error) throw r.error;

  const linkedSupplierIds = new Set((costs.data ?? []).map((c) => c.supplier_invoice_id).filter(Boolean));
  const takenElsewhere = new Set(
    ((await supabase.from("event_cost_entries").select("supplier_invoice_id").not("supplier_invoice_id", "is", null)).data ?? []).map((r) => r.supplier_invoice_id),
  );
  const sheet = combineSheets(sheets.data ?? []);
  const autoCountLinked = fromAutoCount.filter((s) => s.eventId === eventId);
  const autoCountIds = new Set(autoCountLinked.map((s) => s.id));
  const pnl = computeEventPnl(revenue.data ?? [], [...(costs.data ?? []), ...autoCountCostsOf(autoCountLinked, eventId)], sheet);
  return {
    event,
    revenue: revenue.data ?? [],
    costs: costs.data ?? [],
    sheet,
    invoices: invoices.data ?? [],
    budget: budget.data ?? null,
    pnl,
    budgetComparison: budgetVsActual(pnl, (budget.data as Budget) ?? null),
    flags: dataFlagsFor(pnl, event.status),
    /** Supplier invoices keyed in with this event's AutoCount invoice number: already counted as direct costs above. */
    autoCountSupplierInvoices: autoCountLinked,
    /** Supplier invoices of this company that are not yet the cost of any event. */
    availableSupplierInvoices: (supplierInvoices.data ?? []).filter((s) => !takenElsewhere.has(s.id) && !linkedSupplierIds.has(s.id) && !autoCountIds.has(s.id)),
  };
}
