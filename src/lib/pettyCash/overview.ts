/** The cash flow of a petty cash: what came in (income), what went out (expenses) and what is left, for a month or for all time. */

export type CashEntry = { date: string; kind: "in" | "out"; amount: number; category: string | null };

export type TrendMonth = { month: string; income: number; expenses: number };

export type CashOverview = {
  /** "YYYY-MM" or "all" */
  month: string;
  /** what was left at the start of the month (always 0 for "all") */
  opening: number;
  income: number;
  expenses: number;
  /** opening + income - expenses: what is left to spend */
  closing: number;
  byCategory: { label: string; value: number }[];
  trend: TrendMonth[];
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The month before `ym` ("2026-01" gives "2025-12"). */
function previousMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function buildOverview(entries: CashEntry[], month: string, todayMonth: string, trendLength = 6): CashOverview {
  const inMonth = (e: CashEntry) => month === "all" || e.date.startsWith(month);
  const sum = (list: CashEntry[], kind: "in" | "out") => round2(list.filter((e) => e.kind === kind).reduce((t, e) => t + e.amount, 0));
  const current = entries.filter(inMonth);
  const opening = month === "all" ? 0 : round2(sum(entries.filter((e) => e.date.slice(0, 7) < month), "in") - sum(entries.filter((e) => e.date.slice(0, 7) < month), "out"));
  const income = sum(current, "in");
  const expenses = sum(current, "out");

  const cats = new Map<string, number>();
  for (const e of current) if (e.kind === "out") cats.set(e.category?.trim() || "Other", round2((cats.get(e.category?.trim() || "Other") ?? 0) + e.amount));

  // the last months, ending with the chosen month (or this month for "all")
  const end = month === "all" ? todayMonth : month;
  const months: string[] = [end];
  while (months.length < trendLength) months.unshift(previousMonth(months[0]));
  const trend = months.map((m) => {
    const rows = entries.filter((e) => e.date.startsWith(m));
    return { month: m, income: sum(rows, "in"), expenses: sum(rows, "out") };
  });

  return { month, opening, income, expenses, closing: round2(opening + income - expenses), byCategory: Array.from(cats, ([label, value]) => ({ label, value })), trend };
}
