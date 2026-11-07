import { paidSoFar } from "@/lib/finance/paymentQueries";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getMonthlyCostBreakdown } from "@/lib/finance/queries";
import { NOT_OWED_STATUSES, invoiceBalance } from "@/lib/finance/outstanding";
import { listSupplierOwed } from "@/lib/finance/paymentQueries";
import { isPettyCashOverdue, pettyCashDaysPending } from "@/lib/finance/constants";
import { LATE_GRACE_MINUTES } from "@/lib/driver/constants";
import { DUE_SOON_DAYS, formatRM, paymentUrgency } from "@/lib/finance/payments";
import { canAccessModule } from "@/lib/modules";
import type { ModuleKey } from "@/lib/constants";
import { daysBetween } from "@/lib/hr/probation";

type DB = SupabaseClient<Database>;

function sum(rows: { amount: number }[] | null): number {
  return (rows ?? []).reduce((total, row) => total + Number(row.amount), 0);
}

/** All "today / this month" boundaries use Malaysia time, so the dashboard agrees no matter where the server runs. */
function myDateIso(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(date);
}

function todayIso(): string {
  return myDateIso(new Date());
}

function daysFromNowIso(days: number): string {
  return myDateIso(new Date(Date.now() + days * 86_400_000));
}

function monthStartIso(): string {
  return `${todayIso().slice(0, 7)}-01`;
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
  const [nowYear, nowMonth] = todayIso().split("-").map(Number);

  const [revenueRes, supplierPaidRes, expensesRes, marketingExpensesRes, driverExpensesRes, costBreakdown] = await Promise.all([
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
      .not("supplier_invoice_id", "is", null) // Finance supplier payments are counted in the Finance payments summary
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
    // Same source Reports → Monthly Costing uses (covers every module,
    // petty cash included) so this KPI never drifts from that report.
    getMonthlyCostBreakdown(supabase, companyIds, nowYear, nowMonth),
  ]);

  const revenue = sum(revenueRes.data);
  const expenses =
    sum(supplierPaidRes.data) + sum(expensesRes.data) + sum(marketingExpensesRes.data) + sum(driverExpensesRes.data);
  const monthlyCosting = costBreakdown.reduce((t, r) => t + r.amount, 0);

  return {
    revenue,
    expenses,
    monthlyCosting,
  };
}

/**
 * What was paid this month on Finance payments: payments marked as paid with a payment date in the month, plus the part payments
 * (supplier payment ledger) made in the month. A payment that has ledger rows is counted through them only, never twice.
 * Only payments the signed-in person may read are included (the tables enforce it).
 */
async function financePaidThisMonth(supabase: DB, companyIds: string[], category?: "supplier") {
  const monthStart = monthStartIso();
  let direct = supabase.from("finance_payments").select("id, amount").in("company_id", companyIds).eq("status", "paid").gte("paid_date", monthStart).lte("paid_date", todayIso());
  if (category) direct = direct.eq("category", category);
  const [{ data: paidRows }, { data: ledgerRows }] = await Promise.all([
    direct,
    supabase.from("supplier_payments").select("amount, finance_payment_id").in("company_id", companyIds).eq("status", "paid").not("finance_payment_id", "is", null).gte("payment_date", monthStart),
  ]);
  const ids = (paidRows ?? []).map((r) => r.id);
  // payments that were settled through the ledger: their amounts come from the ledger rows
  const { data: linked } = ids.length > 0 ? await supabase.from("supplier_payments").select("finance_payment_id").in("finance_payment_id", ids) : { data: [] as { finance_payment_id: string | null }[] };
  const viaLedger = new Set((linked ?? []).map((l) => l.finance_payment_id));
  const directOnly = (paidRows ?? []).filter((r) => !viaLedger.has(r.id));
  return {
    count: directOnly.length + (ledgerRows ?? []).length,
    amount: sum(directOnly) + sum(ledgerRows),
    /** only the ledger rows (they are already inside the supplier payments total) */
    directAmount: sum(directOnly),
  };
}

export async function getSupplierPayments(supabase: DB, companyIds: string[]) {
  const today = todayIso();
  const weekAhead = daysFromNowIso(7);
  const monthStart = monthStartIso();

  const [openInvoices, { data: paidThisMonthRows }, financePaid] = await Promise.all([
    listSupplierOwed(supabase, companyIds),
    supabase
      .from("supplier_payments")
      .select("amount")
      .in("company_id", companyIds)
      .eq("status", "paid")
      .gte("payment_date", monthStart),
    financePaidThisMonth(supabase, companyIds, "supplier"),
  ]);

  // what is still owed to the suppliers: the monthly supplier payments of Finance not paid yet (the same as the Supplier Outstanding Report)
  const rows = openInvoices;
  const outstanding = rows.reduce((t, r) => t + r.balance, 0);
  const overdueCount = rows.filter((r) => r.due_date && r.due_date < today).length;
  const dueTodayCount = rows.filter((r) => r.due_date === today).length;
  const dueThisWeekCount = rows.filter((r) => r.due_date && r.due_date > today && r.due_date <= weekAhead).length;
  const upcomingCount = rows.filter((r) => !r.due_date || r.due_date > weekAhead).length;
  // the supplier payments recorded in the ledger, plus the Finance supplier payments marked as paid this month
  const paidThisMonth = sum(paidThisMonthRows) + financePaid.directAmount;

  return { outstanding, overdueCount, dueTodayCount, dueThisWeekCount, upcomingCount, paidThisMonth, openCount: rows.length };
}

export async function getCustomerOutstanding(supabase: DB, companyIds: string[]) {
  const today = todayIso();

  const { data: openInvoices } = await supabase
    .from("customer_invoices")
    .select("amount, tax_amount, due_date, status, customer_payments(amount)")
    .in("company_id", companyIds)
    .not("status", "in", `(${NOT_OWED_STATUSES.join(",")})`);

  // the balance still owed: invoice total with tax, less the payments received (the same as the Customer Outstanding Report)
  const rows = (openInvoices ?? []).filter((r) => invoiceBalance(r) > 0);
  const outstanding = rows.reduce((t, r) => t + invoiceBalance(r), 0);
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

/**
 * "Missing clock-in" = an active driver with no attendance row for today at
 * all, past their own expected clock-in time. "Missing clock-out" = clocked
 * in today but never clocked out, checked once the day is basically over.
 */
export async function getDriverAttendanceAlerts(supabase: DB, companyIds: string[]) {
  const today = todayIso();
  const nowParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const nowMinutes = Number(nowParts.find((x) => x.type === "hour")?.value ?? 0) * 60 + Number(nowParts.find((x) => x.type === "minute")?.value ?? 0);

  const [{ data: activeDrivers }, { data: todayAttendance }] = await Promise.all([
    supabase
      .from("driver_profiles")
      .select("employee_id, expected_clock_in_time, employees(full_name, status)")
      .in("company_id", companyIds),
    supabase.from("driver_attendance").select("driver_id, clock_in_time, clock_out_time").in("company_id", companyIds).eq("attendance_date", today),
  ]);

  const attendanceByDriver = new Map((todayAttendance ?? []).map((a) => [a.driver_id, a]));
  const missingClockIn = (activeDrivers ?? []).filter((d) => {
    if (d.employees?.status !== "active") return false;
    if (attendanceByDriver.has(d.employee_id)) return false;
    const [h, m] = d.expected_clock_in_time.split(":").map(Number);
    return nowMinutes > h * 60 + m + LATE_GRACE_MINUTES;
  });

  const missingClockOut = (todayAttendance ?? []).filter((a) => a.clock_in_time && !a.clock_out_time);

  return { missingClockInCount: missingClockIn.length, missingClockOutCount: missingClockOut.length };
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

  // Already-expired documents stay in the list (no lower bound) until they are renewed.
  const [{ count: staffCount }, { data: expiring }, { data: expiringCompanyDocs }, { data: probations }] = await Promise.all([
    supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .in("company_id", companyIds)
      .eq("status", "active"),
    supabase
      .from("employee_certificates")
      .select("id, cert_name, expiry_date, employee_id, employees(full_name)")
      .in("company_id", companyIds)
      .not("expiry_date", "is", null)
      .lte("expiry_date", monthAhead)
      .order("expiry_date", { ascending: true }),
    supabase
      .from("company_documents")
      .select("id, title, expiry_date, companies(name)")
      .in("company_id", companyIds)
      .not("expiry_date", "is", null)
      .lte("expiry_date", monthAhead)
      .order("expiry_date", { ascending: true }),
    // probations that end within 30 days, or ended without a decision (only the HR admins can read these; others get none)
    supabase
      .from("employee_probation")
      .select("id, employee_id, current_end_date, employees(full_name)")
      .in("company_id", companyIds)
      .eq("is_confirmed", false)
      .eq("needs_verification", false)
      .not("current_end_date", "is", null)
      .lte("current_end_date", monthAhead)
      .order("current_end_date", { ascending: true }),
  ]);

  return {
    probations: (probations ?? []).map((p) => ({ ...p, daysLeft: p.current_end_date ? daysBetween(today, p.current_end_date) : 0 })),
    staffCount: staffCount ?? 0,
    expiringCertificates: (expiring ?? []).map((c) => ({ ...c, expired: !!c.expiry_date && c.expiry_date < today })),
    expiringCompanyDocs: (expiringCompanyDocs ?? []).map((d) => ({ ...d, expired: !!d.expiry_date && d.expiry_date < today })),
  };
}

/**
 * Petty cash balance is derived from the ledger, never stored — same pattern
 * as Kitchen's stock. Over-budget lines reuse Finance's own monthly cost
 * breakdown (the same one the Monthly Costing page groups/filters) rather
 * than a second aggregation query.
 */
export async function getFinanceAdminSummary(supabase: DB, companyIds: string[]) {
  const [year, month] = todayIso().split("-").map(Number);

  const [{ data: pettyCashRows }, { data: budgets }] = await Promise.all([
    supabase.from("petty_cash_transactions").select("amount, type, payment_status, transaction_date, claimant_name").in("company_id", companyIds),
    supabase.from("budgets").select("*").in("company_id", companyIds).eq("year", year).eq("month", month),
  ]);

  const pettyCashBalance = (pettyCashRows ?? []).reduce(
    (t, r) => t + (r.type === "top_up" ? Number(r.amount) : -Number(r.amount)),
    0,
  );

  const pendingClaims = (pettyCashRows ?? []).filter((r) => r.payment_status === "pending_payment");
  const overdueClaims = pendingClaims.filter((r) => isPettyCashOverdue(r.transaction_date, r.payment_status));
  const pettyCashPending = {
    count: pendingClaims.length,
    totalAmount: pendingClaims.reduce((t, r) => t + Number(r.amount), 0),
    overdueCount: overdueClaims.length,
    oldestOverdue: overdueClaims
      .map((r) => ({ claimant: r.claimant_name ?? "Unknown", daysPending: pettyCashDaysPending(r.transaction_date) }))
      .sort((a, b) => b.daysPending - a.daysPending)[0],
  };

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

  return { pettyCashBalance, pettyCashPending, overBudget };
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
      .gte("created_at", `${monthStart}T00:00:00+08:00`),
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

/**
 * Pending approvals the signed-in user is allowed to act on: a member limited to some modules only counts the
 * approvals of those modules (OT approvals count for HR or for the separate Overtime permission).
 */
export async function getPendingApprovals(supabase: DB, companyIds: string[], allowedModules: string[] | null = null) {
  const { data } = await supabase.from("approvals").select("module, related_table").in("company_id", companyIds).eq("status", "pending");

  const pendingCount = (data ?? []).filter((a) => {
    if (a.related_table === "overtime_records") return canAccessModule(allowedModules, "hr") || canAccessModule(allowedModules, "overtime");
    return canAccessModule(allowedModules, a.module as ModuleKey);
  }).length;

  return { pendingCount };
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
  /** the page with that very information (opens when the line is pressed) */
  href?: string;
  /** the page with the whole list, used when several alerts of the same kind are folded into one line */
  listHref?: string;
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
  driverAttendance: Awaited<ReturnType<typeof getDriverAttendanceAlerts>>;
  financeAdmin: Awaited<ReturnType<typeof getFinanceAdminSummary>>;
  promotions: Awaited<ReturnType<typeof getPromotionsEndingSoon>>;
  financePayments: Awaited<ReturnType<typeof getFinancePaymentsSummary>>;
}): Alert[] {
  const alerts: Alert[] = [];

  const fp = input.financePayments;
  if (fp.overdueCount > 0) {
    alerts.push({ severity: "danger", title: `🔴 ${fp.overdueCount} overdue Finance payment(s) — ${formatRM(fp.overdueAmount)}`, meta: "Admin & Finance · Payment Dashboard", href: "/finance/payments" });
  }
  if (fp.dueTodayCount > 0) {
    alerts.push({ severity: "warning", title: `🟠 ${fp.dueTodayCount} Finance payment(s) due today — ${formatRM(fp.dueTodayAmount)}`, meta: "Admin & Finance · Payment Dashboard", href: "/finance/payments" });
  }
  if (fp.dueSoonCount > 0) {
    alerts.push({ severity: "info", title: `🟡 ${fp.dueSoonCount} Finance payment(s) due within ${DUE_SOON_DAYS} days — ${formatRM(fp.dueSoonAmount)}`, meta: "Admin & Finance · Payment Dashboard", href: "/finance/payments" });
  }

  if (input.supplierPayments.overdueCount > 0) {
    alerts.push({
      severity: "danger",
      title: `${input.supplierPayments.overdueCount} overdue supplier invoice(s)`,
      meta: "Supplier & Procurement",
      href: "/supplier-procurement/invoices",
    });
  }
  if (input.supplierPayments.dueTodayCount > 0) {
    alerts.push({
      severity: "warning",
      title: `${input.supplierPayments.dueTodayCount} supplier payment(s) due today`,
      meta: "Supplier & Procurement",
      href: "/supplier-procurement/invoices",
    });
  }
  if (input.supplierPayments.dueThisWeekCount > 0) {
    alerts.push({
      severity: "info",
      title: `${input.supplierPayments.dueThisWeekCount} supplier payment(s) due this week`,
      meta: "Supplier & Procurement",
      href: "/supplier-procurement/invoices",
    });
  }
  if (input.customerOutstanding.overdueCount > 0) {
    alerts.push({
      severity: "danger",
      title: `${input.customerOutstanding.overdueCount} overdue customer payment(s)`,
      meta: "Admin & Finance",
      href: "/finance/outstanding",
    });
  }
  for (const b of input.financeAdmin.overBudget) {
    alerts.push({
      severity: "warning",
      title: `Over budget: ${b.category}${b.department ? ` (${b.department})` : ""}`,
      meta: `Admin & Finance · ${b.actual.toFixed(0)} of ${b.budgeted.toFixed(0)} budgeted`,
      href: "/spending/budgets",
    });
  }
  if (input.financeAdmin.pettyCashPending.overdueCount > 0) {
    const oldest = input.financeAdmin.pettyCashPending.oldestOverdue;
    alerts.push({
      severity: "danger",
      title: `${input.financeAdmin.pettyCashPending.overdueCount} overdue petty cash claim(s) awaiting payment`,
      meta: oldest ? `Admin & Finance · oldest: ${oldest.claimant}, ${oldest.daysPending} days pending` : "Admin & Finance",
      href: "/spending/petty-cash?status=pending_payment",
    });
  } else if (input.financeAdmin.pettyCashPending.count > 0) {
    alerts.push({
      severity: "warning",
      title: `${input.financeAdmin.pettyCashPending.count} petty cash claim(s) pending payment`,
      meta: "Admin & Finance",
      href: "/spending/petty-cash?status=pending_payment",
    });
  }
  // HR is reminded 30, 14 and 7 days before a probation ends (the line turns more urgent at each mark), and after it ended without a decision
  for (const pr of input.hr.probations) {
    const name = pr.employees?.full_name ?? "Staff";
    if (pr.daysLeft < 0) {
      alerts.push({ severity: "warning", title: `Probation ended, decision needed: ${name}`, meta: `HR · ended ${pr.current_end_date}`, href: `/hr/${pr.employee_id}#probation`, listHref: "/hr/probation?status=pending_confirmation" });
    } else {
      const mark = pr.daysLeft <= 7 ? 7 : pr.daysLeft <= 14 ? 14 : 30;
      alerts.push({
        severity: mark === 7 ? "danger" : mark === 14 ? "warning" : "info",
        title: `Probation ending: ${name} (${pr.daysLeft === 0 ? "today" : `${pr.daysLeft} day${pr.daysLeft === 1 ? "" : "s"}`})`,
        meta: `HR · probation ends ${pr.current_end_date}`,
        href: `/hr/${pr.employee_id}#probation`,
        listHref: "/hr/probation?status=review_required",
      });
    }
  }
  for (const cert of input.hr.expiringCertificates) {
    alerts.push({
      severity: cert.expired ? "danger" : "warning",
      title: `${cert.expired ? "Document EXPIRED" : "Document expiring"}: ${cert.cert_name}${cert.employees?.full_name ? ` (${cert.employees.full_name})` : ""}`,
      meta: `HR · ${cert.expired ? "expired" : "due"} ${cert.expiry_date}`,
      href: `/hr/${cert.employee_id}`,
      listHref: "/hr",
    });
  }
  for (const doc of input.hr.expiringCompanyDocs) {
    alerts.push({
      severity: doc.expired ? "danger" : "warning",
      title: `${doc.expired ? "Licence/agreement EXPIRED" : "Licence/agreement expiring"}: ${doc.title}`,
      meta: `HR · ${doc.companies?.name ?? "Company"} · ${doc.expired ? "expired" : "due"} ${doc.expiry_date}`,
      href: "/hr/documents",
    });
  }
  for (const event of input.cateringEvents.upcoming) {
    alerts.push({
      severity: "info",
      title: `Upcoming event: ${event.event_name}`,
      meta: `Catering · ${event.event_date}`,
      href: `/catering/${event.id}`,
      listHref: "/catering",
    });
  }
  for (const item of input.lowStock) {
    alerts.push({
      severity: "warning",
      title: `Low stock: ${item.name}`,
      meta: `Kitchen · ${item.current_stock_qty} left (reorder at ${item.reorder_level})`,
      href: `/kitchen/ingredients/${item.id}`,
      listHref: "/kitchen/stock",
    });
  }
  for (const request of input.purchaseRequests.pending) {
    alerts.push({
      severity: "info",
      title: `Purchase request pending: ${request.ingredients?.name ?? "ingredient"}`,
      meta: `Kitchen · ${request.quantity_requested} requested`,
      href: "/kitchen/purchase-requests",
    });
  }
  for (const vehicle of input.vehicles) {
    alerts.push({
      severity: "warning",
      title: `Vehicle maintenance due: ${vehicle.plate_number}`,
      meta: `Operation Management · due ${vehicle.next_maintenance_due}`,
      href: `/driver-logistics/vehicles/${vehicle.id}`,
      listHref: "/driver-logistics/maintenance",
    });
  }
  for (const vehicle of input.driverCompliance.vehicles) {
    const soonest = [vehicle.insurance_expiry, vehicle.road_tax_expiry].filter(Boolean).sort()[0];
    alerts.push({
      severity: "warning",
      title: `Insurance/road tax expiring: ${vehicle.plate_number}`,
      meta: `Operation Management · due ${soonest}`,
      href: `/driver-logistics/vehicles/${vehicle.id}`,
      listHref: "/driver-logistics/vehicles",
    });
  }
  if (input.driverAttendance.missingClockInCount > 0) {
    alerts.push({
      severity: "danger",
      title: `${input.driverAttendance.missingClockInCount} driver(s) missing clock-in today`,
      meta: "Operation Management · Attendance",
      href: "/driver-logistics/attendance",
    });
  }
  if (input.driverAttendance.missingClockOutCount > 0) {
    alerts.push({
      severity: "warning",
      title: `${input.driverAttendance.missingClockOutCount} driver(s) still clocked in (no clock-out yet)`,
      meta: "Operation Management · Attendance",
      href: "/driver-logistics/attendance",
    });
  }
  for (const license of input.driverCompliance.licenses) {
    alerts.push({
      severity: "warning",
      title: `Driver license expiring: ${license.employees?.full_name ?? "driver"}`,
      meta: `Operation Management · due ${license.license_expiry}`,
      href: "/driver-logistics/drivers",
    });
  }
  for (const promo of input.promotions) {
    alerts.push({
      severity: "info",
      title: `Promotion ending soon: ${promo.title}`,
      meta: `Marketing · ends ${promo.end_date}`,
      href: "/marketing/promotions",
    });
  }

  return alerts;
}

/**
 * Unpaid Finance payments (supplier, rental, utilities): overdue, due today and due soon.
 * Only Finance / Admin users can read these records, so `accessible` is false for everyone else and the card stays hidden.
 */
export async function getFinancePaymentsSummary(supabase: DB, companyIds: string[]) {
  const empty = { accessible: false, unpaidTotal: 0, overdueCount: 0, overdueAmount: 0, dueTodayCount: 0, dueTodayAmount: 0, dueSoonCount: 0, dueSoonAmount: 0, paidCount: 0, paidAmount: 0 };
  const adminFlags = await Promise.all(companyIds.map(async (id) => (await supabase.rpc("user_is_company_admin", { target_company_id: id })).data === true));
  const adminIds = companyIds.filter((_, i) => adminFlags[i]);
  if (adminIds.length === 0) return empty;

  const { data } = await supabase.from("finance_payments").select("id, amount, due_date, status").in("company_id", adminIds).not("status", "in", "(paid,cancelled)");
  const today = todayIso();
  const summary = { ...empty, accessible: true };
  const paidNow = await financePaidThisMonth(supabase, adminIds);
  summary.paidCount = paidNow.count;
  summary.paidAmount = paidNow.amount;
  // a part-paid payment counts only its balance
  const paid = await paidSoFar(supabase, (data ?? []).map((p) => p.id));
  for (const p of data ?? []) {
    const amount = Math.max(Number(p.amount) - (paid.get(p.id) ?? 0), 0);
    summary.unpaidTotal += amount;
    const urgency = paymentUrgency(p.status, p.due_date, today);
    if (urgency === "overdue") { summary.overdueCount += 1; summary.overdueAmount += amount; }
    else if (urgency === "due_today") { summary.dueTodayCount += 1; summary.dueTodayAmount += amount; }
    else if (urgency === "due_soon") { summary.dueSoonCount += 1; summary.dueSoonAmount += amount; }
  }
  return summary;
}

/** Runs every section query in parallel for the Main Dashboard page. */
export async function getDashboardData(supabase: DB, companyIds: string[], allowedModules: string[] | null = null) {
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
    driverAttendance,
    financeAdmin,
    promotions,
    financePayments,
  ] = await Promise.all([
    getFinancialOverview(supabase, companyIds),
    getSupplierPayments(supabase, companyIds),
    getCustomerOutstanding(supabase, companyIds),
    getCateringEvents(supabase, companyIds),
    getKitchenProduction(supabase, companyIds),
    getDriverDeliveries(supabase, companyIds),
    getHRSummary(supabase, companyIds),
    getMarketingSummary(supabase, companyIds),
    getPendingApprovals(supabase, companyIds, allowedModules),
    getLowStockIngredients(supabase, companyIds),
    getPendingPurchaseRequests(supabase, companyIds),
    getVehiclesDueMaintenance(supabase, companyIds),
    getDriverCompliance(supabase, companyIds),
    getDriverFleetSummary(supabase, companyIds),
    getDriverAttendanceAlerts(supabase, companyIds),
    getFinanceAdminSummary(supabase, companyIds),
    getPromotionsEndingSoon(supabase, companyIds),
    getFinancePaymentsSummary(supabase, companyIds),
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
    driverAttendance,
    financeAdmin,
    promotions,
    financePayments,
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
    driverAttendance,
    financeAdmin,
    financePayments,
    alerts,
  };
}
