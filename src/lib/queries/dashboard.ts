import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getMonthlyCostBreakdown } from "@/lib/finance/queries";

type DB = SupabaseClient<Database>;

function sum(rows: { amount: number }[] | null): number {
  return (rows ?? []).reduce((total, row) => total + Number(row.amount), 0);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysFromNowIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthStartIso(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

/**
 * Every function below accepts the list of company ids the current dashboard
 * view should aggregate over (already resolved from the company selector +
 * the signed-in user's access grants). Each is independent and reusable —
 * a future module page can import the same function it needs instead of
 * re-querying the same tables its own way.
 */

export async function getFinancialOverview(supabase: DB, companyIds: string[]) {
  const monthStart = monthStartIso();

  const [revenueRes, supplierPaidRes, expensesRes, marketingExpensesRes, driverExpensesRes] = await Promise.all([
    supabase
      .from("customer_payments")
      .select("amount")
      .in("company_id", companyIds)
      .gte("payment_date", monthStart),
    supabase
      .from("supplier_payments")
      .select("amount")
      .in("company_id", companyIds)
      .eq("status", "paid")
      .gte("payment_date", monthStart),
    supabase
      .from("expenses")
      .select("amount")
      .in("company_id", companyIds)
      .gte("expense_date", monthStart),
    supabase
      .from("marketing_expenses")
      .select("amount")
      .in("company_id", companyIds)
      .gte("expense_date", monthStart),
    supabase
      .from("driver_expenses")
      .select("amount")
      .in("company_id", companyIds)
      .gte("expense_date", monthStart),
  ]);

  const revenue = sum(revenueRes.data);
  const monthlyCosting =
    sum(supplierPaidRes.data) + sum(expensesRes.data) + sum(marketingExpensesRes.data) + sum(driverExpensesRes.data);

  return {
    revenue,
    expenses: monthlyCosting,
    monthlyCosting,
  };
}

export async function getSupplierPayments(supabase: DB, companyIds: string[]) {
  const today = todayIso();
  const weekAhead = daysFromNowIso(7);
  const monthStart = monthStartIso();

  const [{ data: openInvoices }, { data: paidThisMonthRows }] = await Promise.all([
    supabase
      .from("supplier_invoices")
      .select("amount, due_date, status")
      .in("company_id", companyIds)
      .neq("status", "paid"),
    supabase
      .from("supplier_payments")
      .select("amount")
      .in("company_id", companyIds)
      .eq("status", "paid")
      .gte("payment_date", monthStart),
  ]);

  const rows = openInvoices ?? [];
  const outstanding = sum(rows);
  const overdueCount = rows.filter((r) => r.due_date < today).length;
  const dueTodayCount = rows.filter((r) => r.due_date === today).length;
  const dueThisWeekCount = rows.filter((r) => r.due_date > today && r.due_date <= weekAhead).length;
  const upcomingCount = rows.filter((r) => r.due_date > weekAhead).length;
  const paidThisMonth = sum(paidThisMonthRows);

  return { outstanding, overdueCount, dueTodayCount, dueThisWeekCount, upcomingCount, paidThisMonth, openCount: rows.length };
}

export async function getCustomerOutstanding(supabase: DB, companyIds: string[]) {
  const today = todayIso();

  const { data: openInvoices } = await supabase
    .from("customer_invoices")
    .select("amount, due_date, status")
    .in("company_id", companyIds)
    .neq("status", "paid");

  const rows = openInvoices ?? [];
  const outstanding = sum(rows);
  const overdueCount = rows.filter((r) => r.due_date < today).length;

  return { outstanding, overdueCount, openCount: rows.length };
}

export async function getCateringEvents(supabase: DB, companyIds: string[]) {
  const today = todayIso();
  const twoWeeksAhead = daysFromNowIso(14);

  const { data, count } = await supabase
    .from("catering_events")
    .select("id, event_name, event_date, pax_count", { count: "exact" })
    .in("company_id", companyIds)
    .gte("event_date", today)
    .lte("event_date", twoWeeksAhead)
    .order("event_date", { ascending: true })
    .limit(5);

  return { upcomingCount: count ?? 0, upcoming: data ?? [] };
}

export async function getKitchenProduction(supabase: DB, companyIds: string[]) {
  const { count } = await supabase
    .from("production_orders")
    .select("id", { count: "exact", head: true })
    .in("company_id", companyIds)
    .neq("status", "completed");

  return { inProgressCount: count ?? 0 };
}

export async function getPendingPurchaseRequests(supabase: DB, companyIds: string[]) {
  const { data, count } = await supabase
    .from("purchase_requests")
    .select("id, quantity_requested, ingredients(name)", { count: "exact" })
    .in("company_id", companyIds)
    .eq("status", "pending");

  return { pendingCount: count ?? 0, pending: data ?? [] };
}

export async function getDriverDeliveries(supabase: DB, companyIds: string[]) {
  const { count } = await supabase
    .from("deliveries")
    .select("id", { count: "exact", head: true })
    .in("company_id", companyIds)
    .neq("status", "delivered");

  const { data: upcoming } = await supabase
    .from("deliveries")
    .select("id, scheduled_time, location, catering_events(event_name)")
    .in("company_id", companyIds)
    .in("status", ["scheduled", "in_transit"])
    .order("scheduled_time", { ascending: true })
    .limit(5);

  return { pendingCount: count ?? 0, upcoming: upcoming ?? [] };
}

export async function getDriverFleetSummary(supabase: DB, companyIds: string[]) {
  const [{ count: totalDrivers }, { count: availableDrivers }] = await Promise.all([
    supabase.from("driver_profiles").select("id", { count: "exact", head: true }).in("company_id", companyIds),
    supabase
      .from("driver_profiles")
      .select("id", { count: "exact", head: true })
      .in("company_id", companyIds)
      .eq("availability_status", "available"),
  ]);

  return { totalDrivers: totalDrivers ?? 0, availableDrivers: availableDrivers ?? 0 };
}

export async function getDriverCompliance(supabase: DB, companyIds: string[]) {
  const monthAhead = daysFromNowIso(30);
  const today = todayIso();

  const [{ data: allVehicles }, { data: allLicenses }] = await Promise.all([
    supabase.from("vehicles").select("id, plate_number, insurance_expiry, road_tax_expiry").in("company_id", companyIds),
    supabase.from("driver_profiles").select("id, license_expiry, employees(full_name)").in("company_id", companyIds),
  ]);

  const withinWindow = (date: string | null) => !!date && date >= today && date <= monthAhead;

  const vehicles = (allVehicles ?? []).filter((v) => withinWindow(v.insurance_expiry) || withinWindow(v.road_tax_expiry));
  const licenses = (allLicenses ?? []).filter((d) => withinWindow(d.license_expiry));

  return { vehicles, licenses };
}

export async function getHRSummary(supabase: DB, companyIds: string[]) {
  const monthAhead = daysFromNowIso(30);
  const today = todayIso();

  const [{ count: staffCount }, { data: expiring }] = await Promise.all([
    supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .in("company_id", companyIds)
      .eq("status", "active"),
    supabase
      .from("employee_certificates")
      .select("id, cert_name, expiry_date, employee_id")
      .in("company_id", companyIds)
      .gte("expiry_date", today)
      .lte("expiry_date", monthAhead),
  ]);

  return { staffCount: staffCount ?? 0, expiringCertificates: expiring ?? [] };
}

/**
 * Petty cash balance is derived from the ledger, never stored — same pattern
 * as Kitchen's stock. Over-budget lines reuse Finance's own monthly cost
 * breakdown (the same one the Monthly Costing page groups/filters) rather
 * than a second aggregation query.
 */
export async function getFinanceAdminSummary(supabase: DB, companyIds: string[]) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [{ data: pettyCashRows }, { data: budgets }] = await Promise.all([
    supabase.from("petty_cash_transactions").select("amount, type").in("company_id", companyIds),
    supabase.from("budgets").select("*").in("company_id", companyIds).eq("year", year).eq("month", month),
  ]);

  const pettyCashBalance = (pettyCashRows ?? []).reduce(
    (t, r) => t + (r.type === "top_up" ? Number(r.amount) : -Number(r.amount)),
    0,
  );

  let overBudget: { category: string; department: string | null; budgeted: number; actual: number }[] = [];
  if (budgets && budgets.length > 0) {
    const rows = await getMonthlyCostBreakdown(supabase, companyIds, year, month);
    overBudget = budgets
      .map((b) => {
        const actual = rows
          .filter((r) => r.category === b.category && r.companyId === b.company_id && (!b.department || r.department === b.department))
          .reduce((t, r) => t + r.amount, 0);
        return { category: b.category, department: b.department, budgeted: Number(b.budgeted_amount), actual };
      })
      .filter((x) => x.actual > x.budgeted);
  }

  return { pettyCashBalance, overBudget };
}

export async function getMarketingSummary(supabase: DB, companyIds: string[]) {
  const monthStart = monthStartIso();

  const [{ count: activeCampaigns }, { count: newLeadsCount }, { data: spendRows }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .in("company_id", companyIds)
      .eq("status", "active"),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .in("company_id", companyIds)
      .gte("created_at", monthStart),
    supabase
      .from("marketing_expenses")
      .select("amount")
      .in("company_id", companyIds)
      .gte("expense_date", monthStart),
  ]);

  return {
    activeCampaigns: activeCampaigns ?? 0,
    newLeadsCount: newLeadsCount ?? 0,
    monthlySpend: sum(spendRows),
  };
}

export async function getPromotionsEndingSoon(supabase: DB, companyIds: string[]) {
  const today = todayIso();
  const weekAhead = daysFromNowIso(7);

  const { data } = await supabase
    .from("promotions")
    .select("id, title, end_date")
    .in("company_id", companyIds)
    .eq("status", "active")
    .gte("end_date", today)
    .lte("end_date", weekAhead);

  return data ?? [];
}

export async function getPendingApprovals(supabase: DB, companyIds: string[]) {
  const { count } = await supabase
    .from("approvals")
    .select("id", { count: "exact", head: true })
    .in("company_id", companyIds)
    .eq("status", "pending");

  return { pendingCount: count ?? 0 };
}

export async function getLowStockIngredients(supabase: DB, companyIds: string[]) {
  const { data } = await supabase
    .from("ingredients")
    .select("id, name, current_stock_qty, reorder_level")
    .in("company_id", companyIds);

  return (data ?? []).filter((i) => Number(i.current_stock_qty) <= Number(i.reorder_level));
}

export async function getVehiclesDueMaintenance(supabase: DB, companyIds: string[]) {
  const monthAhead = daysFromNowIso(30);

  const { data } = await supabase
    .from("vehicles")
    .select("id, plate_number, next_maintenance_due")
    .in("company_id", companyIds)
    .not("next_maintenance_due", "is", null)
    .lte("next_maintenance_due", monthAhead);

  return data ?? [];
}

export type Alert = {
  severity: "danger" | "warning" | "info";
  title: string;
  meta: string;
};

/**
 * Builds the Alerts panel from every signal above. Each source is already
 * fetched for its own section, so this just re-shapes the same data —
 * cheap, and keeps one alert format the dashboard UI renders generically.
 */
export function buildAlerts(input: {
  supplierPayments: Awaited<ReturnType<typeof getSupplierPayments>>;
  customerOutstanding: Awaited<ReturnType<typeof getCustomerOutstanding>>;
  cateringEvents: Awaited<ReturnType<typeof getCateringEvents>>;
  hr: Awaited<ReturnType<typeof getHRSummary>>;
  lowStock: Awaited<ReturnType<typeof getLowStockIngredients>>;
  purchaseRequests: Awaited<ReturnType<typeof getPendingPurchaseRequests>>;
  vehicles: Awaited<ReturnType<typeof getVehiclesDueMaintenance>>;
  driverCompliance: Awaited<ReturnType<typeof getDriverCompliance>>;
  financeAdmin: Awaited<ReturnType<typeof getFinanceAdminSummary>>;
  promotions: Awaited<ReturnType<typeof getPromotionsEndingSoon>>;
}): Alert[] {
  const alerts: Alert[] = [];

  if (input.supplierPayments.overdueCount > 0) {
    alerts.push({
      severity: "danger",
      title: `${input.supplierPayments.overdueCount} overdue supplier invoice(s)`,
      meta: "Supplier & Procurement",
    });
  }
  if (input.supplierPayments.dueTodayCount > 0) {
    alerts.push({
      severity: "warning",
      title: `${input.supplierPayments.dueTodayCount} supplier payment(s) due today`,
      meta: "Supplier & Procurement",
    });
  }
  if (input.supplierPayments.dueThisWeekCount > 0) {
    alerts.push({
      severity: "info",
      title: `${input.supplierPayments.dueThisWeekCount} supplier payment(s) due this week`,
      meta: "Supplier & Procurement",
    });
  }
  if (input.customerOutstanding.overdueCount > 0) {
    alerts.push({
      severity: "danger",
      title: `${input.customerOutstanding.overdueCount} overdue customer payment(s)`,
      meta: "Finance & Admin",
    });
  }
  for (const b of input.financeAdmin.overBudget) {
    alerts.push({
      severity: "warning",
      title: `Over budget: ${b.category}${b.department ? ` (${b.department})` : ""}`,
      meta: `Finance & Admin · ${b.actual.toFixed(0)} of ${b.budgeted.toFixed(0)} budgeted`,
    });
  }
  for (const cert of input.hr.expiringCertificates) {
    alerts.push({
      severity: "warning",
      title: `Certificate expiring: ${cert.cert_name}`,
      meta: `HR · due ${cert.expiry_date}`,
    });
  }
  for (const event of input.cateringEvents.upcoming) {
    alerts.push({
      severity: "info",
      title: `Upcoming event: ${event.event_name}`,
      meta: `Catering · ${event.event_date}`,
    });
  }
  for (const item of input.lowStock) {
    alerts.push({
      severity: "warning",
      title: `Low stock: ${item.name}`,
      meta: `Kitchen · ${item.current_stock_qty} left (reorder at ${item.reorder_level})`,
    });
  }
  for (const request of input.purchaseRequests.pending) {
    alerts.push({
      severity: "info",
      title: `Purchase request pending: ${request.ingredients?.name ?? "ingredient"}`,
      meta: `Kitchen · ${request.quantity_requested} requested`,
    });
  }
  for (const vehicle of input.vehicles) {
    alerts.push({
      severity: "warning",
      title: `Vehicle maintenance due: ${vehicle.plate_number}`,
      meta: `Driver & Logistics · due ${vehicle.next_maintenance_due}`,
    });
  }
  for (const vehicle of input.driverCompliance.vehicles) {
    const soonest = [vehicle.insurance_expiry, vehicle.road_tax_expiry].filter(Boolean).sort()[0];
    alerts.push({
      severity: "warning",
      title: `Insurance/road tax expiring: ${vehicle.plate_number}`,
      meta: `Driver & Logistics · due ${soonest}`,
    });
  }
  for (const license of input.driverCompliance.licenses) {
    alerts.push({
      severity: "warning",
      title: `Driver license expiring: ${license.employees?.full_name ?? "driver"}`,
      meta: `Driver & Logistics · due ${license.license_expiry}`,
    });
  }
  for (const promo of input.promotions) {
    alerts.push({
      severity: "info",
      title: `Promotion ending soon: ${promo.title}`,
      meta: `Marketing · ends ${promo.end_date}`,
    });
  }

  return alerts;
}

/** Runs every section query in parallel for the Main Dashboard page. */
export async function getDashboardData(supabase: DB, companyIds: string[]) {
  const [
    financial,
    supplierPayments,
    customerOutstanding,
    cateringEvents,
    kitchen,
    deliveries,
    hr,
    marketing,
    approvals,
    lowStock,
    purchaseRequests,
    vehicles,
    driverCompliance,
    driverFleet,
    financeAdmin,
    promotions,
  ] = await Promise.all([
    getFinancialOverview(supabase, companyIds),
    getSupplierPayments(supabase, companyIds),
    getCustomerOutstanding(supabase, companyIds),
    getCateringEvents(supabase, companyIds),
    getKitchenProduction(supabase, companyIds),
    getDriverDeliveries(supabase, companyIds),
    getHRSummary(supabase, companyIds),
    getMarketingSummary(supabase, companyIds),
    getPendingApprovals(supabase, companyIds),
    getLowStockIngredients(supabase, companyIds),
    getPendingPurchaseRequests(supabase, companyIds),
    getVehiclesDueMaintenance(supabase, companyIds),
    getDriverCompliance(supabase, companyIds),
    getDriverFleetSummary(supabase, companyIds),
    getFinanceAdminSummary(supabase, companyIds),
    getPromotionsEndingSoon(supabase, companyIds),
  ]);

  const alerts = buildAlerts({
    supplierPayments,
    customerOutstanding,
    cateringEvents,
    hr,
    lowStock,
    purchaseRequests,
    vehicles,
    driverCompliance,
    financeAdmin,
    promotions,
  });

  return {
    financial,
    supplierPayments,
    customerOutstanding,
    cateringEvents,
    kitchen,
    deliveries,
    hr,
    marketing,
    approvals,
    lowStock,
    purchaseRequests,
    driverFleet,
    financeAdmin,
    alerts,
  };
}
