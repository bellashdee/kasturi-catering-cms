import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { resolvePeriod, type DateRange } from "@/lib/finance/constants";
import { getMonthlyCostBreakdown, getMonthlyRevenue } from "@/lib/finance/queries";

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
  const { data: costings } = await supabase
    .from("event_costing")
    .select("catering_event_id, food_cost, ingredient_cost, staff_cost, transport_cost, equipment_cost, other_cost")
    .in("catering_event_id", eventIds.length > 0 ? eventIds : ["00000000-0000-0000-0000-000000000000"]);

  const costingByEvent = new Map((costings ?? []).map((c) => [c.catering_event_id, c]));

  return (events ?? []).map((e) => {
    const costing = costingByEvent.get(e.id);
    const cost = costing
      ? Number(costing.food_cost) + Number(costing.ingredient_cost) + Number(costing.staff_cost) + Number(costing.transport_cost) + Number(costing.equipment_cost) + Number(costing.other_cost)
      : 0;
    const revenue = Number(e.total_amount ?? 0);
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

export async function getMarketingReportRows(supabase: DB, companyIds: string[], year: number, month: number, range?: DateRange) {
  const { start, end } = resolvePeriod(year, month, range);
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, name, channel, status, start_date, end_date, budget, company_id, companies(name)")
    .in("company_id", companyIds)
    .gte("start_date", start)
    .lte("start_date", end)
    .order("start_date", { ascending: false });
  if (error) throw error;
  return data;
}

/**
 * A single-company, single-month printable rollup — the same live figures the
 * Main Dashboard shows "for now", but for any past month/year the user picks.
 * Reuses Finance's own aggregation rather than re-deriving totals a second way.
 */
/** Revenue and total cost of every month of a year (index 0 = January), for the summary picture. Months with no figures are 0. */
export async function getYearMonthlySeries(supabase: DB, companyIds: string[], year: number) {
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const rows = await Promise.all(
    months.map(async (m) => {
      const [revenue, cost] = await Promise.all([getMonthlyRevenue(supabase, companyIds, year, m), getMonthlyCostBreakdown(supabase, companyIds, year, m)]);
      return { revenue, cost: cost.reduce((t, r) => t + r.amount, 0) };
    }),
  );
  return { revenue: rows.map((r) => r.revenue), cost: rows.map((r) => r.cost) };
}

export async function getCompanySummary(supabase: DB, companyIds: string[], year: number, month: number, range?: DateRange) {
  const { start, end } = resolvePeriod(year, month, range);

  const [revenue, costBreakdown, headcountRes, campaignsRes, productionRes, deliveriesRes, supplierOutstandingRes, customerOutstandingRes] = await Promise.all([
    getMonthlyRevenue(supabase, companyIds, year, month, range),
    getMonthlyCostBreakdown(supabase, companyIds, year, month, range),
    supabase.from("employees").select("id", { count: "exact", head: true }).in("company_id", companyIds).eq("status", "active"),
    supabase.from("campaigns").select("id", { count: "exact", head: true }).in("company_id", companyIds).eq("status", "active"),
    supabase.from("production_orders").select("id", { count: "exact", head: true }).in("company_id", companyIds).gte("planned_date", start).lte("planned_date", end),
    supabase.from("deliveries").select("id", { count: "exact", head: true }).in("company_id", companyIds).gte("scheduled_time", `${start}T00:00:00+08:00`).lte("scheduled_time", `${end}T23:59:59.999+08:00`),
    supabase.from("supplier_invoices").select("amount").in("company_id", companyIds).neq("status", "paid"),
    supabase.from("customer_invoices").select("amount").in("company_id", companyIds).neq("status", "paid"),
  ]);

  const totalCost = costBreakdown.reduce((t, r) => t + r.amount, 0);
  const bySource = new Map<string, number>();
  for (const r of costBreakdown) bySource.set(r.source, (bySource.get(r.source) ?? 0) + r.amount);

  return {
    revenue,
    totalCost,
    net: revenue - totalCost,
    bySource: Array.from(bySource.entries()).map(([source, amount]) => ({ source, amount })).sort((a, b) => b.amount - a.amount),
    activeStaff: headcountRes.count ?? 0,
    activeCampaigns: campaignsRes.count ?? 0,
    productionOrders: productionRes.count ?? 0,
    deliveries: deliveriesRes.count ?? 0,
    supplierOutstanding: (supplierOutstandingRes.data ?? []).reduce((t, r) => t + Number(r.amount), 0),
    customerOutstanding: (customerOutstandingRes.data ?? []).reduce((t, r) => t + Number(r.amount), 0),
  };
}
