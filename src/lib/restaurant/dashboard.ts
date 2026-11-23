import type { SupabaseClient } from "@supabase/supabase-js";
import { listSpending, sameLabel, type CostRow } from "@/lib/finance/queries";
import { RAW_ITEM_CATEGORIES } from "@/lib/monthlyBreakdown/restoranBara";
import { todayInMalaysia } from "@/lib/format";
import type { Database } from "@/lib/supabase/types";

export type RangeKey = "today" | "yesterday" | "week" | "month" | "custom";
export const RANGE_LABEL: Record<RangeKey, string> = { today: "Today", yesterday: "Yesterday", week: "This week", month: "This month", custom: "Custom" };

const isDate = (v: string | undefined | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The days a filter covers (Malaysia dates). "This week" runs from Monday to today, "This month" from the 1st to today. */
export function resolveRange(range: string | undefined, fromParam: string | undefined, toParam: string | undefined, today = todayInMalaysia()): { key: RangeKey; from: string; to: string } {
  if (range === "yesterday") {
    const d = addDays(today, -1);
    return { key: "yesterday", from: d, to: d };
  }
  if (range === "week") {
    const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
    return { key: "week", from: addDays(today, -dow), to: today };
  }
  if (range === "month") return { key: "month", from: `${today.slice(0, 7)}-01`, to: today };
  if (range === "custom" && isDate(fromParam) && isDate(toParam)) {
    let from = fromParam;
    let to = toParam;
    if (from > to) [from, to] = [to, from];
    if (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 366 * 86_400_000) from = addDays(to, -366);
    return { key: "custom", from, to };
  }
  return { key: "today", from: today, to: today };
}

export type SalesLine = {
  id: string;
  sales_date: string;
  shift_no: number;
  channel: string;
  payment_method: string;
  gross_amount: number;
  discount_amount: number;
  refund_amount: number;
  orders_count: number | null;
  status: string;
  notes: string | null;
  cancel_reason: string | null;
};

export const netOf = (l: Pick<SalesLine, "gross_amount" | "discount_amount" | "refund_amount">) => Number(l.gross_amount) - Number(l.discount_amount) - Number(l.refund_amount);

/** Every sales line of the days (all statuses), oldest day first. The default row limit of the API is 1,000, so ask for more. */
export async function fetchSalesLines(db: SupabaseClient, companyId: string, from: string, to: string): Promise<SalesLine[]> {
  const { data, error } = await db
    .from("rst_sales_daily")
    .select("id, sales_date, shift_no, channel, payment_method, gross_amount, discount_amount, refund_amount, orders_count, status, notes, cancel_reason")
    .eq("company_id", companyId)
    .gte("sales_date", from)
    .lte("sales_date", to)
    .order("sales_date", { ascending: true })
    .order("shift_no", { ascending: true })
    .range(0, 9999);
  if (error) throw error;
  return ((data ?? []) as SalesLine[]).map((l) => ({ ...l, gross_amount: Number(l.gross_amount), discount_amount: Number(l.discount_amount), refund_amount: Number(l.refund_amount), orders_count: l.orders_count === null ? null : Number(l.orders_count) }));
}

export type Totals = { gross: number; discount: number; refund: number; net: number; orders: number; ordersNet: number; lines: number };

export function totalsOf(lines: SalesLine[]): Totals {
  const t: Totals = { gross: 0, discount: 0, refund: 0, net: 0, orders: 0, ordersNet: 0, lines: lines.length };
  for (const l of lines) {
    t.gross += l.gross_amount;
    t.discount += l.discount_amount;
    t.refund += l.refund_amount;
    t.net += netOf(l);
    if (l.orders_count !== null) {
      t.orders += l.orders_count;
      t.ordersNet += netOf(l);
    }
  }
  return t;
}

export function groupNet(lines: SalesLine[], keyOf: (l: SalesLine) => string): { key: string; net: number; orders: number; lines: number }[] {
  const map = new Map<string, { key: string; net: number; orders: number; lines: number }>();
  for (const l of lines) {
    const k = keyOf(l);
    const cur = map.get(k) ?? { key: k, net: 0, orders: 0, lines: 0 };
    cur.net += netOf(l);
    cur.orders += l.orders_count ?? 0;
    cur.lines += 1;
    map.set(k, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.net - a.net);
}

/** The days of a range that have no sales line at all (a day that is over and nothing was entered for it). */
export function missingDays(from: string, to: string, lines: SalesLine[], today = todayInMalaysia()): string[] {
  const have = new Set(lines.filter((l) => l.status !== "cancelled").map((l) => l.sales_date));
  const out: string[] = [];
  for (let d = from; d <= to && d < today; d = addDays(d, 1)) if (!have.has(d)) out.push(d);
  return out;
}

/**
 * Food bought in the days, from Company Expenses (the food categories of the Monthly Breakdown). This is the cost the restaurant has
 * today: it is recorded when the food is bought, not when it is used (there is no stock count yet). Credit notes count as minus.
 */
export async function fetchFoodPurchases(db: SupabaseClient, companyId: string, from: string, to: string): Promise<number> {
  return (await fetchFoodPurchaseRows(db, companyId, from, to)).reduce((t, r) => t + r.amount, 0);
}

/** The food purchases themselves (each with its record and bills), the ones fetchFoodPurchases adds up. */
export async function fetchFoodPurchaseRows(db: SupabaseClient, companyId: string, from: string, to: string): Promise<CostRow[]> {
  const rows = await listSpending(db as unknown as SupabaseClient<Database>, [companyId], from, to);
  return rows.filter((r) => RAW_ITEM_CATEGORIES.some((f) => sameLabel(r.category, f)));
}

export type CashSessionRow = {
  id: string;
  session_date: string;
  shift_no: number;
  opening_cash: number;
  cash_expenses: number;
  withdrawals: number;
  status: string;
  expected_closing: number | null;
  counted_closing: number | null;
  variance: number | null;
  variance_note: string | null;
  reopen_reason: string | null;
};

export async function fetchCashSessions(db: SupabaseClient, companyId: string, from: string, to: string): Promise<CashSessionRow[]> {
  const { data, error } = await db
    .from("rst_cash_sessions")
    .select("id, session_date, shift_no, opening_cash, cash_expenses, withdrawals, status, expected_closing, counted_closing, variance, variance_note, reopen_reason")
    .eq("company_id", companyId)
    .gte("session_date", from)
    .lte("session_date", to)
    .order("session_date", { ascending: false })
    .order("shift_no", { ascending: true })
    .range(0, 4999);
  if (error) throw error;
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    session_date: r.session_date as string,
    shift_no: Number(r.shift_no),
    opening_cash: Number(r.opening_cash),
    cash_expenses: Number(r.cash_expenses),
    withdrawals: Number(r.withdrawals),
    status: r.status as string,
    expected_closing: n(r.expected_closing),
    counted_closing: n(r.counted_closing),
    variance: n(r.variance),
    variance_note: (r.variance_note as string | null) ?? null,
    reopen_reason: (r.reopen_reason as string | null) ?? null,
  }));
}

/** The cash the till should hold now: opening + cash sales of the shift (confirmed lines) - cash expenses - withdrawals. */
export function expectedCash(s: Pick<CashSessionRow, "opening_cash" | "cash_expenses" | "withdrawals" | "session_date" | "shift_no">, lines: SalesLine[]): { cashIn: number; expected: number; drafts: number } {
  const mine = lines.filter((l) => l.sales_date === s.session_date && l.shift_no === s.shift_no && l.payment_method === "cash");
  const cashIn = mine.filter((l) => l.status === "confirmed").reduce((t, l) => t + netOf(l), 0);
  return { cashIn, expected: s.opening_cash + cashIn - s.cash_expenses - s.withdrawals, drafts: mine.filter((l) => l.status === "draft").length };
}

/** The AutoCount monthly total of a month (all the rows keyed in for it), or null when none is keyed. */
export async function fetchMonthlyTotal(db: SupabaseClient, companyId: string, month: string): Promise<number | null> {
  const rows = await fetchMonthlyTotalRows(db, companyId, month);
  return rows.length === 0 ? null : rows.reduce((t, r) => t + r.amount, 0);
}

/** The rows keyed in for the AutoCount monthly total (one total, or catering + daily), with their record ids. */
export async function fetchMonthlyTotalRows(db: SupabaseClient, companyId: string, month: string): Promise<{ id: string; amount: number; salesType: string }[]> {
  const [y, m] = month.split("-").map(Number);
  const { data, error } = await db.from("monthly_sales").select("id, sales_amount, sales_type").eq("company_id", companyId).eq("year", y).eq("month", m);
  if (error || !data) return [];
  return (data as { id: string; sales_amount: number; sales_type: string }[]).map((r) => ({ id: r.id, amount: Number(r.sales_amount), salesType: r.sales_type }));
}
