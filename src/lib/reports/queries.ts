import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { resolvePeriod, type DateRange } from "@/lib/finance/constants";
import { getMonthlyCostBreakdown, getMonthlyRevenue, listSpending } from "@/lib/finance/queries";
import { NOT_OWED_STATUSES, invoiceBalance } from "@/lib/finance/outstanding";
import { listSupplierOwed } from "@/lib/finance/paymentQueries";
import { computeEventPnl } from "@/lib/finance/eventPnl";
import { salesByCompanyMonth, totalSalesByMonth } from "@/lib/reports/sales";

type DB = SupabaseClient<Database>;

export async function getRevenueReportRows(supabase: DB, companyIds: string[], year: number, month: number, range?: DateRange) {
  const { start, end } = resolvePeriod(year, month, range);
  const { data, error } = await supabase
    .from("customer_payments")
    .select("id, amount, payment_date, company_id, companies(name), customer_invoices(invoice_number, status, customers(name))")
    .in("company_id", companyIds)
    .gte("payment_date", start)
    .lte("payment_date", end)
    .order("payment_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getCateringReportRows(supabase: DB, companyIds: string[], year: number, month: number, range?: DateRange) {
  const { start, end } = resolvePeriod(year, month, range);
  const { data: events, error } = await supabase
    .from("catering_events")
    .select("id, event_name, event_date, pax_count, event_type, status, total_amount, company_id, companies(name), customers(name)")
    .in("company_id", companyIds)
    .gte("event_date", start)
    .lte("event_date", end)
    .order("event_date", { ascending: false });
  if (error) throw error;

  const eventIds = (events ?? []).map((e) => e.id);
  const ids = eventIds.length > 0 ? eventIds : ["00000000-0000-0000-0000-000000000000"];
  // the same three sources as the Event P&L (Finance), so the two always tally: the costing sheet of the event, and the revenue and cost entries kept in the P&L
  const [costingsRes, revenueRes, costEntriesRes] = await Promise.all([
    supabase.from("event_costing").select("catering_event_id, food_cost, ingredient_cost, staff_cost, transport_cost, equipment_cost, other_cost").in("catering_event_id", ids),
    supabase.from("event_revenue_entries").select("catering_event_id, entry_type, amount").in("catering_event_id", ids),
    supabase.from("event_cost_entries").select("catering_event_id, cost_class, cost_type, amount, cost_basis").in("catering_event_id", ids),
  ]);

  return (events ?? []).map((e) => {
    const sheets = (costingsRes.data ?? []).filter((c) => c.catering_event_id === e.id);
    const sheet = sheets.length === 0 ? null : {
      food_cost: sheets.reduce((t, r) => t + Number(r.food_cost), 0),
      ingredient_cost: sheets.reduce((t, r) => t + Number(r.ingredient_cost), 0),
      staff_cost: sheets.reduce((t, r) => t + Number(r.staff_cost), 0),
      transport_cost: sheets.reduce((t, r) => t + Number(r.transport_cost), 0),
      equipment_cost: sheets.reduce((t, r) => t + Number(r.equipment_cost), 0),
      other_cost: sheets.reduce((t, r) => t + Number(r.other_cost), 0),
    };
    const revenueEntries = (revenueRes.data ?? []).filter((r) => r.catering_event_id === e.id);
    const pnl = computeEventPnl(revenueEntries, (costEntriesRes.data ?? []).filter((c) => c.catering_event_id === e.id), sheet);
    const cost = pnl.directCosts + pnl.additionalExpenses;
    // the revenue recorded in the Event P&L; an event with none recorded there keeps the amount of the event itself
    const revenue = revenueEntries.length > 0 ? pnl.netRevenue : Number(e.total_amount ?? 0);
    return { ...e, cost, revenue, margin: revenue - cost };
  });
}

export async function getSupplierPaymentReportRows(supabase: DB, companyIds: string[], year: number, month: number, range?: DateRange) {
  const { start, end } = resolvePeriod(year, month, range);
  const startTs = `${start}T00:00:00+08:00`;
  const endTs = `${end}T23:59:59.999+08:00`;
  const { data, error } = await supabase
    .from("supplier_payments")
    .select("id, amount, status, payment_date, payment_method, created_at, company_id, companies(name), supplier_invoices(invoice_number, department, suppliers(name))")
    .in("company_id", companyIds)
    .not("supplier_invoice_id", "is", null) // Finance supplier payments are reported from finance_payments
    .gte("created_at", startTs)
    .lte("created_at", endTs)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getHRReportRows(supabase: DB, companyIds: string[], year: number, month: number, range?: DateRange) {
  const { start, end } = resolvePeriod(year, month, range);
  const { data, error } = await supabase
    .from("payroll_records")
    .select("id, gross_pay, net_pay, deductions, status, pay_period_start, pay_period_end, company_id, companies(name), employees(full_name, department)")
    .in("company_id", companyIds)
    .gte("pay_period_end", start)
    .lte("pay_period_end", end)
    .order("pay_period_end", { ascending: false });
  if (error) throw error;
  return data;
}

/**
 * A single-company, single-month printable rollup — the same live figures the
 * Main Dashboard shows "for now", but for any past month/year the user picks.
 * Reuses Finance's own aggregation rather than re-deriving totals a second way.
 */
/**
 * Revenue and total cost of every month of a year (index 0 = January), for the summary picture. Months with no figures are 0.
 * Revenue = the sales of each company by the one rule of every page (salesByCompanyMonth: keyed in, or the invoices issued when none is
 * keyed). `received` is always the payments received.
 */
export async function getYearMonthlySeries(supabase: DB, companyIds: string[], year: number) {
  // the whole year in one go (a few queries) instead of one set of queries for each of the twelve months
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const [costs, payments, sales] = await Promise.all([
    listSpending(supabase, companyIds, start, end),
    supabase.from("customer_payments").select("company_id, amount, payment_date").in("company_id", companyIds).gte("payment_date", start).lte("payment_date", end),
    salesByCompanyMonth(supabase, companyIds, year),
  ]);
  const received = Array<number>(12).fill(0);
  const cost = Array<number>(12).fill(0);
  for (const p of payments.data ?? []) received[Number(p.payment_date.slice(5, 7)) - 1] += Number(p.amount);
  const revenue = totalSalesByMonth(sales.by);
  for (const c of costs) {
    const m = Number(c.date.slice(5, 7)) - 1;
    if (m >= 0 && m < 12) cost[m] += c.amount;
  }
  return { revenue, cost, received };
}

export async function getCompanySummary(supabase: DB, companyIds: string[], year: number, month: number, range?: DateRange) {
  const { start, end } = resolvePeriod(year, month, range);

  const [received, sales, costBreakdown, headcountRes, campaignsRes, productionRes, deliveriesRes, supplierOutstandingRes, customerOutstandingRes] = await Promise.all([
    getMonthlyRevenue(supabase, companyIds, year, month, range),
    // sales by the one rule of every page; a custom day range cannot be cut out of a monthly figure, so it keeps to the payments received
    range ? Promise.resolve(null) : salesByCompanyMonth(supabase, companyIds, year),
    getMonthlyCostBreakdown(supabase, companyIds, year, month, range),
    supabase.from("employees").select("id", { count: "exact", head: true }).in("company_id", companyIds).eq("status", "active"),
    supabase.from("campaigns").select("id", { count: "exact", head: true }).in("company_id", companyIds).eq("status", "active"),
    supabase.from("production_orders").select("id", { count: "exact", head: true }).in("company_id", companyIds).gte("planned_date", start).lte("planned_date", end),
    supabase.from("deliveries").select("id", { count: "exact", head: true }).in("company_id", companyIds).gte("scheduled_time", `${start}T00:00:00+08:00`).lte("scheduled_time", `${end}T23:59:59.999+08:00`),
    listSupplierOwed(supabase, companyIds),
    // the balance still owed, worked out like the Customer Outstanding Report and the Performance Dashboard (total with tax, less payments)
    supabase.from("customer_invoices").select("amount, tax_amount, status, customer_payments(amount)").in("company_id", companyIds).not("status", "in", `(${NOT_OWED_STATUSES.join(",")})`),
  ]);

  // revenue = the sales of the month (keyed in, or the invoices issued when none is keyed); the payments received for a day range
  const revenue = sales ? totalSalesByMonth(sales.by)[month - 1] : received;

  const totalCost = costBreakdown.reduce((t, r) => t + r.amount, 0);
  const bySource = new Map<string, number>();
  for (const r of costBreakdown) bySource.set(r.source, (bySource.get(r.source) ?? 0) + r.amount);

  return {
    revenue,
    received,
    totalCost,
    net: revenue - totalCost,
    bySource: Array.from(bySource.entries()).map(([source, amount]) => ({ source, amount })).sort((a, b) => b.amount - a.amount),
    activeStaff: headcountRes.count ?? 0,
    activeCampaigns: campaignsRes.count ?? 0,
    productionOrders: productionRes.count ?? 0,
    deliveries: deliveriesRes.count ?? 0,
    supplierOutstanding: supplierOutstandingRes.reduce((t, r) => t + r.balance, 0),
    customerOutstanding: (customerOutstandingRes.data ?? []).reduce((t, r) => t + invoiceBalance(r), 0),
  };
}
