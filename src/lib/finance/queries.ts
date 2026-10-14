import { applyInvoiceDateFilter, type InvoiceDateFilter } from "@/lib/finance/dateFilter";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { resolvePeriod, type DateRange } from "@/lib/finance/constants";

type DB = SupabaseClient<Database>;

export type CostRow = {
  source: "Kitchen" | "Catering" | "Supplier" | "Driver" | "Marketing" | "HR" | "Company Expenses" | "Petty Cash" | "Finance Payments";
  category: string;
  department: string | null;
  amount: number;
  companyId: string;
};

/**
 * Pulls one month's costs from every module's own tables — nothing is copied
 * into a Finance-owned "transactions" table. Each row keeps its source,
 * category and (where the owning module tracks one) department, so the
 * Monthly Costing page can filter/group in memory instead of needing a
 * different query per filter combination.
 */
export async function getMonthlyCostBreakdown(supabase: DB, companyIds: string[], year: number, month: number, range?: DateRange): Promise<CostRow[]> {
  const { start, end } = resolvePeriod(year, month, range);
  const startTs = `${start}T00:00:00+08:00`;
  const endTs = `${end}T23:59:59.999+08:00`;

  const [
    kitchenMovements,
    cateringCosting,
    supplierPayments,
    driverExpenses,
    marketingExpenses,
    payrollRecords,
    companyExpenses,
    pettyCash,
    financePayments,
  ] = await Promise.all([
    supabase
      .from("stock_movements")
      .select("company_id, quantity, movement_type, ingredients(unit_cost)")
      .in("company_id", companyIds)
      .in("movement_type", ["out", "wastage"])
      .gte("created_at", startTs)
      .lte("created_at", endTs),
    supabase
      .from("event_costing")
      .select("company_id, food_cost, ingredient_cost, staff_cost, transport_cost, equipment_cost, other_cost, catering_events!inner(event_date)")
      .in("company_id", companyIds)
      .gte("catering_events.event_date", start)
      .lte("catering_events.event_date", end),
    supabase
      .from("supplier_payments")
      .select("company_id, amount, supplier_invoices(department)")
      .in("company_id", companyIds)
      .eq("status", "paid")
      .gte("payment_date", start)
      .lte("payment_date", end),
    supabase
      .from("driver_expenses")
      .select("company_id, amount, category")
      .in("company_id", companyIds)
      .gte("expense_date", start)
      .lte("expense_date", end),
    supabase
      .from("marketing_expenses")
      .select("company_id, amount, category")
      .in("company_id", companyIds)
      .gte("expense_date", start)
      .lte("expense_date", end),
    supabase
      .from("payroll_records")
      .select("company_id, gross_pay, employees(department)")
      .in("company_id", companyIds)
      .eq("status", "paid")
      .gte("pay_period_end", start)
      .lte("pay_period_end", end),
    supabase
      .from("expenses")
      .select("company_id, amount, category, department")
      .in("company_id", companyIds)
      .gte("expense_date", start)
      .lte("expense_date", end),
    supabase
      .from("petty_cash_transactions")
      .select("company_id, amount, category, type")
      .in("company_id", companyIds)
      .eq("type", "expense")
      .gte("transaction_date", start)
      .lte("transaction_date", end),
    // Read-through only: paid Finance payments are never copied into another table, so nothing is counted twice.
    supabase
      .from("finance_payments")
      .select("company_id, amount, category, utility_provider")
      .in("company_id", companyIds)
      .eq("status", "paid")
      // Supplier payments settle purchases that are already counted in the costing (daily purchase costs), so only
      // rental and utilities flow in here; adding supplier payments too would count the same cost twice.
      .neq("category", "supplier")
      // Paid with a payment date in the month; a payment ticked as paid without a date yet counts in its payment month.
      .or(`and(paid_date.gte.${start},paid_date.lte.${end}),and(paid_date.is.null,period_month.eq.${start})`),
  ]);

  const rows: CostRow[] = [];

  for (const m of kitchenMovements.data ?? []) {
    const cost = Math.abs(Number(m.quantity)) * Number(m.ingredients?.unit_cost ?? 0);
    if (cost > 0) {
      rows.push({
        source: "Kitchen",
        category: m.movement_type === "wastage" ? "Wastage" : "Ingredients Consumed",
        department: null,
        amount: cost,
        companyId: m.company_id,
      });
    }
  }

  for (const c of cateringCosting.data ?? []) {
    const parts: [string, number][] = [
      ["Food Cost", Number(c.food_cost)],
      ["Ingredient Cost", Number(c.ingredient_cost)],
      ["Staff Cost", Number(c.staff_cost)],
      ["Transport Cost", Number(c.transport_cost)],
      ["Equipment Cost", Number(c.equipment_cost)],
      ["Other Cost", Number(c.other_cost)],
    ];
    for (const [category, amount] of parts) {
      if (amount > 0) rows.push({ source: "Catering", category, department: null, amount, companyId: c.company_id });
    }
  }

  for (const p of supplierPayments.data ?? []) {
    rows.push({
      source: "Supplier",
      category: "Supplier Payments",
      department: p.supplier_invoices?.department ?? null,
      amount: Number(p.amount),
      companyId: p.company_id,
    });
  }

  for (const d of driverExpenses.data ?? []) {
    rows.push({ source: "Driver", category: d.category, department: null, amount: Number(d.amount), companyId: d.company_id });
  }

  for (const mk of marketingExpenses.data ?? []) {
    rows.push({ source: "Marketing", category: mk.category, department: null, amount: Number(mk.amount), companyId: mk.company_id });
  }

  for (const pr of payrollRecords.data ?? []) {
    rows.push({
      source: "HR",
      category: "Payroll",
      department: pr.employees?.department ?? null,
      amount: Number(pr.gross_pay),
      companyId: pr.company_id,
    });
  }

  for (const e of companyExpenses.data ?? []) {
    rows.push({
      source: "Company Expenses",
      category: e.category,
      department: e.department ?? null,
      amount: Number(e.amount),
      companyId: e.company_id,
    });
  }

  for (const pc of pettyCash.data ?? []) {
    rows.push({
      source: "Petty Cash",
      category: pc.category ?? "Other",
      department: null,
      amount: Number(pc.amount),
      companyId: pc.company_id,
    });
  }

  for (const fp of financePayments.data ?? []) {
    rows.push({
      source: "Finance Payments",
      category: fp.category === "supplier" ? "Supplier Payment" : fp.category === "rental" ? "Rental" : `Utilities – ${fp.utility_provider ?? "Other"}`,
      department: null,
      amount: Number(fp.amount),
      companyId: fp.company_id,
    });
  }

  return rows;
}

export async function getMonthlyRevenue(supabase: DB, companyIds: string[], year: number, month: number, range?: DateRange) {
  const { start, end } = resolvePeriod(year, month, range);
  const { data } = await supabase
    .from("customer_payments")
    .select("amount")
    .in("company_id", companyIds)
    .gte("payment_date", start)
    .lte("payment_date", end);
  return (data ?? []).reduce((t, r) => t + Number(r.amount), 0);
}

export async function listCostCategories(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("cost_categories")
    .select("*")
    .or(`company_id.is.null,company_id.in.(${companyIds.join(",")})`)
    .order("name");
  if (error) throw error;
  return data;
}

export async function listCompanyExpenses(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("expenses")
    .select("*, companies(name)")
    .in("company_id", companyIds)
    .order("expense_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listPettyCashTransactions(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("petty_cash_transactions")
    .select("*, companies(name)")
    .in("company_id", companyIds)
    .order("transaction_date", { ascending: false });
  if (error) throw error;
  return data;
}

/**
 * Claim-level rollup for the Petty Cash dashboard summary — counts and
 * totals by payment status, derived from the same rows the claims table
 * shows (no separate/duplicated ledger).
 */
export function summarizePettyCashClaims(claims: { amount: number | string; payment_status: string }[]) {
  const paid = claims.filter((c) => c.payment_status === "paid");
  const pending = claims.filter((c) => c.payment_status === "pending_payment");
  return {
    totalClaims: claims.length,
    pendingCount: pending.length,
    paidCount: paid.length,
    totalPendingAmount: pending.reduce((t, c) => t + Number(c.amount), 0),
    totalPaidAmount: paid.reduce((t, c) => t + Number(c.amount), 0),
  };
}

export async function listBudgets(supabase: DB, companyIds: string[]) {
  const { data, error } = await supabase
    .from("budgets")
    .select("*, companies(name)")
    .in("company_id", companyIds)
    .order("year", { ascending: false })
    .order("month", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listCustomerInvoices(supabase: DB, companyIds: string[], dateFilter?: InvoiceDateFilter) {
  const { data, error } = await applyInvoiceDateFilter(
    supabase
      .from("customer_invoices")
      .select("*, customers(name), companies(name), customer_payments(amount, payment_date)")
      .in("company_id", companyIds),
    dateFilter,
  ).order("invoice_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getCustomerInvoice(supabase: DB, id: string) {
  const { data, error } = await supabase
    .from("customer_invoices")
    .select("*, customers(id, name), companies(name), customer_payments(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Total sales for the month. Uses the monthly sales figures recorded for the selected companies;
 * when none is recorded, falls back to customer payments received that month.
 */
export async function getMonthlySales(supabase: DB, companyIds: string[], year: number, month: number, range?: DateRange) {
  const { data } = await supabase
    .from("monthly_sales")
    .select("company_id, sales_amount")
    .in("company_id", companyIds)
    .eq("year", year)
    .eq("month", month);
  const recorded = data ?? [];
  if (recorded.length > 0) {
    return { amount: recorded.reduce((t, r) => t + Number(r.sales_amount), 0), recorded: true };
  }
  return { amount: await getMonthlyRevenue(supabase, companyIds, year, month, range), recorded: false };
}
