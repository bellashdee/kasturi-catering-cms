import type { SupabaseClient } from "@supabase/supabase-js";
import { listSpending, sameLabel } from "@/lib/finance/queries";
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
export function missingDays(from: string, to: string, lines: SalesLine[], today = todayInMalaysia(), totals: Pick<DayTotalRow, "sales_date" | "status">[] = []): string[] {
  const have = new Set([...lines.filter((l) => l.status !== "cancelled").map((l) => l.sales_date), ...totals.filter((d) => d.status !== "cancelled").map((d) => d.sales_date)]);
  const out: string[] = [];
  for (let d = from; d <= to && d < today; d = addDays(d, 1)) if (!have.has(d)) out.push(d);
  return out;
}

/**
 * Food bought in the days, from Company Expenses (the food categories of the Monthly Breakdown). This is the cost the restaurant has
 * today: it is recorded when the food is bought, not when it is used (there is no stock count yet). Credit notes count as minus.
 */
export async function fetchFoodPurchases(db: SupabaseClient, companyId: string, from: string, to: string): Promise<number> {
  const rows = await listSpending(db as unknown as SupabaseClient<Database>, [companyId], from, to);
  return rows.filter((r) => RAW_ITEM_CATEGORIES.some((f) => sameLabel(r.category, f))).reduce((t, r) => t + r.amount, 0);
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
export function expectedCash(
  s: Pick<CashSessionRow, "opening_cash" | "cash_expenses" | "withdrawals" | "session_date" | "shift_no">,
  lines: SalesLine[],
  closeUp: { confirmedCash: number | null; draftWaiting: boolean; sessionsToday: number } = { confirmedCash: null, draftWaiting: false, sessionsToday: 1 },
): { cashIn: number; expected: number; drafts: number; source: "closeup" | "lines"; closeUpCashOfDay: number | null; waiting: boolean } {
  const mine = lines.filter((l) => l.sales_date === s.session_date && l.shift_no === s.shift_no && l.payment_method === "cash");
  const linesCash = mine.filter((l) => l.status === "confirmed").reduce((t, l) => t + netOf(l), 0);
  // a confirmed Close up of the day gives the cash sales of the day (it is per day, not per shift): it feeds the session only when the day has one session
  const useCloseUp = closeUp.confirmedCash !== null && closeUp.sessionsToday === 1;
  const cashIn = useCloseUp ? (closeUp.confirmedCash as number) : linesCash;
  return {
    cashIn,
    expected: s.opening_cash + cashIn - s.cash_expenses - s.withdrawals,
    drafts: useCloseUp ? 0 : mine.filter((l) => l.status === "draft").length,
    source: useCloseUp ? "closeup" : "lines",
    closeUpCashOfDay: closeUp.confirmedCash,
    waiting: closeUp.draftWaiting,
  };
}

/** The monthly Total Sales of a month (Reports → Monthly Breakdown, table monthly_sales: all the rows keyed in for it), or null when none is keyed. */
export async function fetchMonthlyTotal(db: SupabaseClient, companyId: string, month: string): Promise<number | null> {
  const [y, m] = month.split("-").map(Number);
  const { data, error } = await db.from("monthly_sales").select("sales_amount").eq("company_id", companyId).eq("year", y).eq("month", m);
  if (error || !data || data.length === 0) return null;
  return (data as { sales_amount: number }[]).reduce((t, r) => t + Number(r.sales_amount), 0);
}


/* ------------------------------------------------------------------ day totals from the FeedMe POS (no split by channel or payment method) */

export type DayTotalRow = {
  id: string;
  sales_date: string;
  outlet: string;
  source: string;
  bills: number;
  pax: number | null;
  gross: number;
  /** as FeedMe writes it: zero or negative */
  discount: number;
  service_charge: number;
  sst: number;
  delivery_fee: number;
  rounding: number;
  nett: number;
  status: string;
  source_file: string | null;
  cancel_reason: string | null;
  manual_lines_ack: number | null;
};

export async function fetchDayTotals(db: SupabaseClient, companyId: string, from: string, to: string): Promise<DayTotalRow[]> {
  const { data, error } = await db
    .from("rst_sales_day_totals")
    .select("id, sales_date, outlet, source, bills, pax, gross, discount, service_charge, sst, delivery_fee, rounding, nett, status, source_file, cancel_reason, manual_lines_ack")
    .eq("company_id", companyId)
    .gte("sales_date", from)
    .lte("sales_date", to)
    .order("sales_date", { ascending: true })
    .range(0, 4999);
  if (error) throw error;
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    sales_date: r.sales_date as string,
    outlet: r.outlet as string,
    source: r.source as string,
    bills: Number(r.bills),
    pax: n(r.pax),
    gross: Number(r.gross),
    discount: Number(r.discount),
    service_charge: Number(r.service_charge),
    sst: Number(r.sst),
    delivery_fee: Number(r.delivery_fee),
    rounding: Number(r.rounding),
    nett: Number(r.nett),
    status: r.status as string,
    source_file: (r.source_file as string | null) ?? null,
    cancel_reason: (r.cancel_reason as string | null) ?? null,
    manual_lines_ack: n(r.manual_lines_ack),
  }));
}

/** The sales of a FeedMe day: gross less discount. Service charge, SST, delivery fee and rounding are collected with the bill but are not sales, so they are shown apart. */
export const dayTotalNet = (d: Pick<DayTotalRow, "gross" | "discount">) => d.gross + d.discount;

export type DaySales = {
  date: string;
  net: number;
  gross: number;
  discount: number;
  refund: number;
  orders: number;
  /** the net sales of the part that has an order count (for the average order value) */
  ordersNet: number;
  pax: number;
  /** where the figure of the day comes from: a FeedMe day total, or the sales lines keyed in (split by channel and payment method) */
  source: "feedme" | "lines";
  /** net of the split lines of the same day (they only explain a FeedMe day total) */
  linesNet: number;
  linesCount: number;
};

/**
 * THE RULE for a day: when a confirmed FeedMe day total exists, it IS the sales of that day (bills, pax, gross, discount); the split lines of
 * the same day are not added to it, they only explain it (the dashboard shows what is "not split" and flags a difference). A day without a
 * FeedMe total takes its figures from the confirmed sales lines. Cancelled and draft rows never count.
 */
export function combineDays(confirmedLines: SalesLine[], confirmedTotals: DayTotalRow[]): DaySales[] {
  const byDate = new Map<string, DaySales>();
  const dayOf = (date: string): DaySales => {
    let d = byDate.get(date);
    if (!d) {
      d = { date, net: 0, gross: 0, discount: 0, refund: 0, orders: 0, ordersNet: 0, pax: 0, source: "lines", linesNet: 0, linesCount: 0 };
      byDate.set(date, d);
    }
    return d;
  };
  for (const l of confirmedLines) {
    const d = dayOf(l.sales_date);
    d.linesNet += netOf(l);
    d.linesCount += 1;
  }
  const feedmeDates = new Set(confirmedTotals.map((t) => t.sales_date));
  for (const l of confirmedLines) {
    if (feedmeDates.has(l.sales_date)) continue;
    const d = dayOf(l.sales_date);
    d.net += netOf(l);
    d.gross += l.gross_amount;
    d.discount += l.discount_amount;
    d.refund += l.refund_amount;
    if (l.orders_count !== null) {
      d.orders += l.orders_count;
      d.ordersNet += netOf(l);
    }
  }
  for (const t of confirmedTotals) {
    const d = dayOf(t.sales_date);
    d.source = "feedme";
    d.net += dayTotalNet(t);
    d.gross += t.gross;
    d.discount += -t.discount;
    d.orders += t.bills;
    d.ordersNet += dayTotalNet(t);
    d.pax += t.pax ?? 0;
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function totalsOfDays(days: DaySales[]): Totals {
  const t: Totals = { gross: 0, discount: 0, refund: 0, net: 0, orders: 0, ordersNet: 0, lines: 0 };
  for (const d of days) {
    t.gross += d.gross;
    t.discount += d.discount;
    t.refund += d.refund;
    t.net += d.net;
    t.orders += d.orders;
    t.ordersNet += d.ordersNet;
    t.lines += d.linesCount;
  }
  return t;
}

/** What FeedMe collected with the bills besides the sales, for the days of a range (confirmed totals only). */
export function feedmeExtras(confirmedTotals: DayTotalRow[]) {
  const x = { days: new Set(confirmedTotals.map((t) => t.sales_date)).size, bills: 0, pax: 0, serviceCharge: 0, sst: 0, deliveryFee: 0, rounding: 0, nett: 0 };
  for (const t of confirmedTotals) {
    x.bills += t.bills;
    x.pax += t.pax ?? 0;
    x.serviceCharge += t.service_charge;
    x.sst += t.sst;
    x.deliveryFee += t.delivery_fee;
    x.rounding += t.rounding;
    x.nett += t.nett;
  }
  return x;
}


/* ------------------------------------------------------------------ the FeedMe Close up of a day (split by payment method and by order type) */

export type CloseUpRow = {
  id: string;
  day_total_id: string;
  sales_date: string;
  bills: number;
  pax: number | null;
  nett: number;
  void_bills: number;
  void_amount: number;
  refund_amount: number;
};
export type CloseUpSplitRow = { day_total_id: string; sales_date: string; kind: "payment" | "channel"; mapped_key: string; raw_label: string; qty: number; amount: number };

export async function fetchCloseUps(db: SupabaseClient, companyId: string, from: string, to: string): Promise<{ closeups: CloseUpRow[]; splits: CloseUpSplitRow[] }> {
  const [c, s] = await Promise.all([
    db.from("rst_day_closeups").select("id, day_total_id, sales_date, bills, pax, nett, void_bills, void_amount, refund_amount").eq("company_id", companyId).gte("sales_date", from).lte("sales_date", to).range(0, 4999),
    db.from("rst_day_closeup_splits").select("day_total_id, sales_date, kind, mapped_key, raw_label, qty, amount").eq("company_id", companyId).gte("sales_date", from).lte("sales_date", to).range(0, 19999),
  ]);
  if (c.error) throw c.error;
  if (s.error) throw s.error;
  return {
    closeups: ((c.data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      day_total_id: r.day_total_id as string,
      sales_date: r.sales_date as string,
      bills: Number(r.bills),
      pax: r.pax === null ? null : Number(r.pax),
      nett: Number(r.nett),
      void_bills: Number(r.void_bills),
      void_amount: Number(r.void_amount),
      refund_amount: Number(r.refund_amount),
    })),
    splits: ((s.data ?? []) as Record<string, unknown>[]).map((r) => ({
      day_total_id: r.day_total_id as string,
      sales_date: r.sales_date as string,
      kind: r.kind as "payment" | "channel",
      mapped_key: r.mapped_key as string,
      raw_label: r.raw_label as string,
      qty: Number(r.qty),
      amount: Number(r.amount),
    })),
  };
}

export const NOT_SPLIT = "__not_split";

/**
 * The "By payment method" and "By channel" tables. For a day with a confirmed FeedMe day total that has a Close up, the Close up split is used
 * (its amounts are the Nett collected: they include service charge, SST and rounding) and the lines keyed in by hand for that day are left out
 * (they only explain). A FeedMe day without a Close up is counted as "not split" apart from what the lines keyed in for it explain. A day
 * without a FeedMe total uses its confirmed lines. Nothing is added twice.
 */
export function breakdownRows(
  kind: "payment" | "channel",
  confirmedLines: SalesLine[],
  days: DaySales[],
  activeSplits: CloseUpSplitRow[],
  closeUpDates: Set<string>,
): { key: string; net: number; orders: number; lines: number }[] {
  const map = new Map<string, { key: string; net: number; orders: number; lines: number }>();
  const add = (key: string, amount: number, qty: number, lines: number) => {
    const cur = map.get(key) ?? { key, net: 0, orders: 0, lines: 0 };
    cur.net += amount;
    cur.orders += qty;
    cur.lines += lines;
    map.set(key, cur);
  };
  for (const s of activeSplits) if (s.kind === kind) add(s.mapped_key, s.amount, s.qty, 1);
  for (const l of confirmedLines) {
    if (closeUpDates.has(l.sales_date)) continue;
    add(kind === "payment" ? l.payment_method : l.channel, netOf(l), l.orders_count ?? 0, 1);
  }
  for (const d of days) {
    if (d.source !== "feedme" || closeUpDates.has(d.date)) continue;
    const rest = d.net - d.linesNet;
    if (Math.abs(rest) >= 0.005) add(NOT_SPLIT, rest, 0, 0);
  }
  return Array.from(map.values()).sort((a, b) => b.net - a.net);
}

/** The cash sales of a day from a confirmed Close up (the CASH total), or null when the day has none. */
export function closeUpCash(splits: CloseUpSplitRow[], date: string): number | null {
  const mine = splits.filter((s) => s.sales_date === date && s.kind === "payment");
  if (mine.length === 0) return null;
  return mine.filter((s) => s.mapped_key === "cash").reduce((t, s) => t + s.amount, 0);
}
