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
  /** the record it comes from (unique with the source) */
  id: string;
  /** the day it counts on (YYYY-MM-DD) */
  date: string;
  /** what it was, as written on the record (notes, description, payee) */
  details: string | null;
};

/**
 * Whether a cost's category or department is the one chosen in a filter: the same words, whatever the capitals and spaces ("Ayam" is
 * "AYAM"). Monthly Costing, its report and Company Expenses all filter this way, so they keep the same total.
 */
export function sameLabel(value: string | null | undefined, chosen: string): boolean {
  const norm = (s: string) => s.toUpperCase().replace(/\s+/g, " ").trim();
  return norm(value ?? "") === norm(chosen);
}

/**
 * Pulls one month's costs from every module's own tables — nothing is copied
 * into a Finance-owned "transactions" table. Each row keeps its source,
 * category and (where the owning module tracks one) department, so the
 * Monthly Costing page can filter/group in memory instead of needing a
 * different query per filter combination.
 */
export async function getMonthlyCostBreakdown(supabase: DB, companyIds: string[], year: number, month: number, range?: DateRange): Promise<CostRow[]> {
  const { start, end } = resolvePeriod(year, month, range);
  return listSpending(supabase, companyIds, start, end);
}

/**
 * Every cost of the companies between two days (or all of them when no days are given): the one list that Monthly Costing, the
 * reports and Company Expenses all add up, so they always tally. The petty cash book is read as the signed-in person may see it.
 */
export async function listSpending(supabase: DB, companyIds: string[], from?: string, to?: string): Promise<CostRow[]> {
  const start = from || "0001-01-01";
  const end = to || "9999-12-31";
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
    pettyCashBook,
    financePayments,
  ] = await Promise.all([
    supabase
      .from("stock_movements")
      .select("id, company_id, quantity, movement_type, created_at, ingredients(unit_cost)")
      .in("company_id", companyIds)
      .in("movement_type", ["out", "wastage"])
      .gte("created_at", startTs)
      .lte("created_at", endTs),
    supabase
      .from("event_costing")
      .select("id, company_id, food_cost, ingredient_cost, staff_cost, transport_cost, equipment_cost, other_cost, catering_events!inner(event_date, event_name)")
      .in("company_id", companyIds)
      .gte("catering_events.event_date", start)
      .lte("catering_events.event_date", end),
    supabase
      .from("supplier_payments")
      .select("id, company_id, amount, payment_date, supplier_invoices(department)")
      .in("company_id", companyIds)
      .eq("status", "paid")
      .not("supplier_invoice_id", "is", null) // Finance supplier payments are counted from finance_payments
      .gte("payment_date", start)
      .lte("payment_date", end),
    supabase
      .from("driver_expenses")
      .select("id, company_id, amount, category, expense_date")
      .in("company_id", companyIds)
      .gte("expense_date", start)
      .lte("expense_date", end),
    supabase
      .from("marketing_expenses")
      .select("id, company_id, amount, category, expense_date")
      .in("company_id", companyIds)
      .gte("expense_date", start)
      .lte("expense_date", end),
    supabase
      .from("payroll_records")
      .select("id, company_id, gross_pay, pay_period_end, employees(department, full_name)")
      .in("company_id", companyIds)
      .eq("status", "paid")
      .gte("pay_period_end", start)
      .lte("pay_period_end", end),
    supabase
      .from("expenses")
      .select("id, company_id, amount, category, department, expense_date, notes")
      .in("company_id", companyIds)
      .gte("expense_date", start)
      .lte("expense_date", end),
    supabase
      .from("petty_cash_transactions")
      .select("id, company_id, amount, category, type, transaction_date, description, claimant_name")
      .in("company_id", companyIds)
      .eq("type", "expense")
      .gte("transaction_date", start)
      .lte("transaction_date", end),
    // the money spent from the petty cash book (an entry for more than one company is counted once, under its main company)
    supabase
      .from("operation_petty_cash")
      .select("id, company_id, amount, category, entry_date, description")
      .in("company_id", companyIds)
      .eq("entry_type", "expense")
      .gte("entry_date", start)
      .lte("entry_date", end),
    // Read-through only: paid Finance payments are never copied into another table, so nothing is counted twice.
    supabase
      .from("finance_payments")
      .select("id, company_id, amount, category, utility_provider, paid_date, period_month, payee_name")
      .in("company_id", companyIds)
      .eq("status", "paid")
      // Supplier payments settle purchases that are already counted in the costing (daily purchase costs), so only
      // rental and utilities flow in here; adding supplier payments too would count the same cost twice.
      .neq("category", "supplier")
      // Paid with a payment date in the month; a payment ticked as paid without a date yet counts in its payment month.
      .or(`and(paid_date.gte.${start},paid_date.lte.${end}),and(paid_date.is.null,period_month.gte.${start},period_month.lte.${end})`),
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
        id: m.id,
        // the Malaysian day (the month's filter above is in Malaysian time too), so grouping by date matches the month's own query
        date: new Date(new Date(m.created_at).getTime() + 8 * 3600_000).toISOString().slice(0, 10),
        details: null,
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
      if (amount > 0) rows.push({ source: "Catering", category, department: null, amount, companyId: c.company_id, id: `${c.id}-${category}`, date: c.catering_events?.event_date ?? "", details: c.catering_events?.event_name ?? null });
    }
  }

  for (const p of supplierPayments.data ?? []) {
    rows.push({
      source: "Supplier",
      category: "Supplier Payments",
      department: p.supplier_invoices?.department ?? null,
      amount: Number(p.amount),
      companyId: p.company_id,
      id: p.id,
      date: p.payment_date ?? "",
      details: null,
    });
  }

  for (const d of driverExpenses.data ?? []) {
    rows.push({ source: "Driver", category: d.category, department: null, amount: Number(d.amount), companyId: d.company_id, id: d.id, date: d.expense_date, details: null });
  }

  for (const mk of marketingExpenses.data ?? []) {
    rows.push({ source: "Marketing", category: mk.category, department: null, amount: Number(mk.amount), companyId: mk.company_id, id: mk.id, date: mk.expense_date, details: null });
  }

  for (const pr of payrollRecords.data ?? []) {
    rows.push({
      source: "HR",
      category: "Payroll",
      department: pr.employees?.department ?? null,
      amount: Number(pr.gross_pay),
      companyId: pr.company_id,
      id: pr.id,
      date: pr.pay_period_end,
      details: pr.employees?.full_name ?? null,
    });
  }

  for (const e of companyExpenses.data ?? []) {
    rows.push({
      source: "Company Expenses",
      category: e.category,
      department: e.department ?? null,
      amount: Number(e.amount),
      companyId: e.company_id,
      id: e.id,
      date: e.expense_date,
      details: e.notes ?? null,
    });
  }

  for (const pc of pettyCash.data ?? []) {
    rows.push({
      source: "Petty Cash",
      category: pc.category ?? "Other",
      department: null,
      amount: Number(pc.amount),
      companyId: pc.company_id,
      id: pc.id,
      date: pc.transaction_date,
      details: [pc.description, pc.claimant_name ? `Staff claim: ${pc.claimant_name}` : null].filter(Boolean).join(" · ") || null,
    });
  }

  for (const pb of pettyCashBook.data ?? []) {
    rows.push({
      source: "Petty Cash",
      category: pb.category ?? "Other",
      department: null,
      amount: Number(pb.amount),
      companyId: pb.company_id,
      id: pb.id,
      date: pb.entry_date,
      details: pb.description ?? null,
    });
  }

  for (const fp of financePayments.data ?? []) {
    rows.push({
      source: "Finance Payments",
      category: fp.category === "supplier" ? "Supplier Payment" : fp.category === "rental" ? "RENTAL" : "UTILITIES",
      department: null,
      amount: Number(fp.amount),
      companyId: fp.company_id,
      id: fp.id,
      date: fp.paid_date ?? fp.period_month,
      details: [fp.payee_name, fp.category !== "rental" && fp.utility_provider ? fp.utility_provider : null].filter(Boolean).join(" · ") || null,
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

/**
 * The category choices for a drop-down: the same category kept by several companies (or written "Other" / "OTHER") is listed once,
 * in alphabetical order. The name written in capitals wins, as in the imported costing sheets.
 */
export function uniqueCategories<T extends { name: string }>(categories: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const c of categories) {
    const key = c.name.toUpperCase().replace(/\s+/g, " ").trim();
    const kept = byKey.get(key);
    if (!kept || (c.name === c.name.toUpperCase() && kept.name !== kept.name.toUpperCase())) byKey.set(key, c);
  }
  return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name));
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

export async function listPettyCashTransactions(supabase: DB, companyIds: string[], holderPattern?: string) {
  let query = supabase.from("petty_cash_transactions").select("*, companies(name)").in("company_id", companyIds);
  // only the petty cash of one person (a case-insensitive "equals" pattern)
  if (holderPattern) query = query.ilike("person_name", holderPattern);
  const { data, error } = await query.order("transaction_date", { ascending: false });
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
      .select("*, customers(name, sales_agent), companies(name), customer_payments(amount, payment_date)")
      .in("company_id", companyIds),
    dateFilter,
  ).order("invoice_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getCustomerInvoice(supabase: DB, id: string) {
  const { data, error } = await supabase
    .from("customer_invoices")
    .select("*, customers(id, name, billing_address, phone, registration_no, credit_term), companies(name, legal_name, registration_no), customer_payments(*)")
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
    .select("company_id, sales_type, sales_amount")
    .in("company_id", companyIds)
    .eq("year", year)
    .eq("month", month);
  const recorded = data ?? [];
  const sumOf = (type: string) => recorded.filter((r) => r.sales_type === type).reduce((t, r) => t + Number(r.sales_amount), 0);
  const catering = sumOf("catering");
  const daily = sumOf("daily");
  const split = recorded.some((r) => r.sales_type !== "total") ? { catering, daily } : null;
  if (recorded.length > 0) {
    return { amount: recorded.reduce((t, r) => t + Number(r.sales_amount), 0), recorded: true, split };
  }
  return { amount: await getMonthlyRevenue(supabase, companyIds, year, month, range), recorded: false, split };
}
