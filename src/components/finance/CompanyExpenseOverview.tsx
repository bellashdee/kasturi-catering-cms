import { formatCurrency } from "@/lib/format";
import { PieChart } from "@/components/reports/PieChart";

/**
 * Company expenses at a glance, like the petty cash: what was spent this month and last month, the months side by side and where the
 * money went. It follows the search and the filters of the list (category, department, words). The months (tiles and bars) are counted
 * from every matching expense, whatever the From / To dates; the category chart and the total are of the list as shown.
 */

export type ExpenseEntry = { date: string; amount: number; category: string };

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortMonth = (ym: string) => MONTH_SHORT[Number(ym.slice(5, 7)) - 1] ?? ym;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The month before `ym` ("2026-01" gives "2025-12"). */
function previousMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function Tile({ label, value, tone, sub }: { label: string; value: string; tone: "expense" | "neutral" | "good"; sub?: string }) {
  const bar = tone === "expense" ? "var(--color-danger)" : tone === "good" ? "var(--color-success)" : "var(--color-primary)";
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface text-center shadow-sm">
      <div className="h-1.5" style={{ background: bar }} />
      <div className="px-4 py-3.5">
        <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">{label}</div>
        <div className="mt-1 text-[26px] font-extrabold leading-tight tabular-nums" style={{ color: tone === "neutral" ? "var(--color-text)" : bar }}>{value}</div>
        {sub && <div className="mt-0.5 text-[12px] text-text-secondary">{sub}</div>}
      </div>
    </div>
  );
}

/** What was spent in each of the last months, side by side. */
function MonthBars({ trend }: { trend: { month: string; total: number }[] }) {
  const max = Math.max(...trend.map((t) => t.total), 1);
  const W = 360;
  const H = 120;
  const slot = W / trend.length;
  const bw = Math.min(26, slot / 2);
  return (
    <svg viewBox={`0 0 ${W} ${H + 36}`} className="w-full" role="img" aria-label="Expenses by month">
      <line x1="0" x2={W} y1={H + 14} y2={H + 14} style={{ stroke: "var(--color-border-strong)" }} strokeWidth="1" />
      {trend.map((t, i) => {
        const cx = slot * i + slot / 2;
        const h = (t.total / max) * H;
        return (
          <g key={t.month}>
            <rect x={cx - bw / 2} y={H + 14 - h} width={bw} height={h} rx="2" style={{ fill: "var(--color-danger)" }}>
              <title>{`${t.month}: ${formatCurrency(t.total)}`}</title>
            </rect>
            {t.total > 0 && (
              <text x={cx} y={H + 10 - h} textAnchor="middle" fontSize="9" fontWeight="600" style={{ fill: "var(--color-text-secondary)" }}>
                {t.total >= 1000 ? `${(t.total / 1000).toFixed(1)}k` : Math.round(t.total)}
              </text>
            )}
            <text x={cx} y={H + 29} textAnchor="middle" fontSize="11" fontWeight="600" style={{ fill: "var(--color-text-secondary)" }}>{shortMonth(t.month)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function CompanyExpenseOverview({
  entries,
  monthEntries,
  thisMonth,
  periodLabel,
}: {
  /** the expenses of the list (every filter) */
  entries: ExpenseEntry[];
  /** the same expenses without the From / To dates, for the months */
  monthEntries: ExpenseEntry[];
  /** "YYYY-MM": the month of the first tile (this month, or the month of the To date) */
  thisMonth: string;
  periodLabel: string;
}) {
  const lastMonth = previousMonth(thisMonth);
  const spentIn = (ym: string) => round2(monthEntries.filter((e) => e.date.startsWith(ym)).reduce((t, e) => t + e.amount, 0));
  const now = spentIn(thisMonth);
  const before = spentIn(lastMonth);
  const change = round2(now - before);
  const listTotal = round2(entries.reduce((t, e) => t + e.amount, 0));

  const months: string[] = [thisMonth];
  while (months.length < 6) months.unshift(previousMonth(months[0]));
  const trend = months.map((m) => ({ month: m, total: spentIn(m) }));

  const byCategory = new Map<string, number>();
  for (const e of entries) {
    const label = e.category.trim() || "Other";
    byCategory.set(label, round2((byCategory.get(label) ?? 0) + e.amount));
  }
  const slices = Array.from(byCategory, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  return (
    <section className="flex flex-col gap-4" aria-label="Expenses overview">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="This month" value={formatCurrency(now)} tone="expense" sub={`Spent in ${shortMonth(thisMonth)} ${thisMonth.slice(0, 4)}`} />
        <Tile label="Last month" value={formatCurrency(before)} tone="neutral" sub={`Spent in ${shortMonth(lastMonth)} ${lastMonth.slice(0, 4)}`} />
        <Tile
          label="Change"
          value={`${change > 0 ? "+" : change < 0 ? "−" : ""}${formatCurrency(Math.abs(change))}`}
          tone={change > 0 ? "expense" : "good"}
          sub={change > 0 ? "More than last month" : change < 0 ? "Less than last month" : "Same as last month"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="text-[15px] font-bold text-text">Expenses summary</div>
          <div className="mt-0.5 text-[12.5px] text-text-secondary">{periodLabel}</div>
          <table className="mt-3 w-full text-[13.5px]">
            <tbody>
              <tr className="border-b border-border">
                <td className="py-2 text-text-secondary">{`Last month (${shortMonth(lastMonth)})`}</td>
                <td className="py-2 text-right font-semibold tabular-nums text-text">{formatCurrency(before)}</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 text-text-secondary">{`This month (${shortMonth(thisMonth)})`}</td>
                <td className="py-2 text-right font-semibold tabular-nums text-danger">{formatCurrency(now)}</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 text-text-secondary">Expenses in the list</td>
                <td className="py-2 text-right font-semibold tabular-nums text-text">{entries.length}</td>
              </tr>
              <tr>
                <td className="py-2 font-bold text-text">Total of the list</td>
                <td className="py-2 text-right text-[15px] font-extrabold tabular-nums text-text">{formatCurrency(listTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[15px] font-bold text-text">Expenses by month</div>
            <div className="flex items-center gap-1.5 text-[12px] text-text-secondary">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--color-danger)" }} />
              Expenses
            </div>
          </div>
          <div className="mt-3">
            <MonthBars trend={trend} />
          </div>
        </div>
      </div>

      {slices.length > 0 && <PieChart title={`Expenses by category (${periodLabel.toLowerCase()})`} slices={slices} />}
    </section>
  );
}
