import { formatCurrency } from "@/lib/format";
import { PieChart } from "@/components/reports/PieChart";
import type { CashOverview } from "@/lib/pettyCash/overview";

/**
 * Petty cash at a glance, like a monthly budget sheet: income, expenses and what is left, the cash flow summary of the month, the
 * last months side by side and where the money went. Only income and expenses: nothing else is shown here.
 */

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortMonth = (ym: string) => MONTH_SHORT[Number(ym.slice(5, 7)) - 1] ?? ym;

function Tile({ label, value, tone, sub }: { label: string; value: string; tone: "income" | "expense" | "left"; sub?: string }) {
  const bar = tone === "income" ? "var(--color-success)" : tone === "expense" ? "var(--color-danger)" : "var(--color-primary)";
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface text-center shadow-sm">
      <div className="h-1.5" style={{ background: bar }} />
      <div className="px-4 py-3.5">
        <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">{label}</div>
        <div className="mt-1 text-[26px] font-extrabold leading-tight tabular-nums" style={{ color: tone === "left" ? "var(--color-text)" : bar }}>{value}</div>
        {sub && <div className="mt-0.5 text-[12px] text-text-secondary">{sub}</div>}
      </div>
    </div>
  );
}

/** Income and expenses of the chosen period as two bars. */
function FlowBars({ income, expenses }: { income: number; expenses: number }) {
  const max = Math.max(income, expenses, 1);
  const rows = [
    { label: "Income", value: income, colour: "var(--color-success)" },
    { label: "Expenses", value: expenses, colour: "var(--color-danger)" },
  ];
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="font-semibold text-text">{r.label}</span>
            <span className="font-bold tabular-nums text-text">{formatCurrency(r.value)}</span>
          </div>
          <div className="mt-1 h-3.5 rounded-full bg-surface-alt">
            <div className="h-3.5 rounded-full" style={{ width: `${Math.max((r.value / max) * 100, r.value > 0 ? 2 : 0)}%`, background: r.colour }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Income and expenses of the last months, side by side. */
function TrendBars({ trend }: { trend: CashOverview["trend"] }) {
  const max = Math.max(...trend.flatMap((t) => [t.income, t.expenses]), 1);
  const W = 360;
  const H = 120;
  const slot = W / trend.length;
  const bw = Math.min(18, slot / 3);
  return (
    <svg viewBox={`0 0 ${W} ${H + 22}`} className="w-full" role="img" aria-label="Income and expenses by month">
      <line x1="0" x2={W} y1={H} y2={H} style={{ stroke: "var(--color-border-strong)" }} strokeWidth="1" />
      {trend.map((t, i) => {
        const cx = slot * i + slot / 2;
        const hi = (t.income / max) * H;
        const he = (t.expenses / max) * H;
        return (
          <g key={t.month}>
            <rect x={cx - bw - 1} y={H - hi} width={bw} height={hi} rx="2" style={{ fill: "var(--color-success)" }}>
              <title>{`${t.month} income: ${formatCurrency(t.income)}`}</title>
            </rect>
            <rect x={cx + 1} y={H - he} width={bw} height={he} rx="2" style={{ fill: "var(--color-danger)" }}>
              <title>{`${t.month} expenses: ${formatCurrency(t.expenses)}`}</title>
            </rect>
            <text x={cx} y={H + 15} textAnchor="middle" fontSize="11" fontWeight="600" style={{ fill: "var(--color-text-secondary)" }}>{shortMonth(t.month)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function PettyCashOverview({ overview, periodLabel }: { overview: CashOverview; periodLabel: string }) {
  const { opening, income, expenses, closing, byCategory, trend } = overview;
  const all = overview.month === "all";
  return (
    <section className="flex flex-col gap-4" aria-label="Cash flow overview">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="Income" value={formatCurrency(income)} tone="income" sub={all ? "Received, all time" : "Money received this month"} />
        <Tile label="Expenses" value={formatCurrency(expenses)} tone="expense" sub={all ? "Spent, all time" : "Money spent this month"} />
        <Tile label="Left to spend" value={formatCurrency(closing)} tone="left" sub={closing < 0 ? "Spent more than received" : undefined} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="text-[15px] font-bold text-text">Cash flow summary</div>
          <div className="mt-0.5 text-[12.5px] text-text-secondary">{periodLabel}</div>
          <table className="mt-3 w-full text-[13.5px]">
            <tbody>
              {!all && (
                <tr className="border-b border-border">
                  <td className="py-2 text-text-secondary">Brought forward</td>
                  <td className="py-2 text-right font-semibold tabular-nums text-text">{formatCurrency(opening)}</td>
                </tr>
              )}
              <tr className="border-b border-border">
                <td className="py-2 text-text-secondary">Income</td>
                <td className="py-2 text-right font-semibold tabular-nums text-success">{formatCurrency(income)}</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 text-text-secondary">Expenses</td>
                <td className="py-2 text-right font-semibold tabular-nums text-danger">{formatCurrency(expenses)}</td>
              </tr>
              <tr>
                <td className="py-2 font-bold text-text">Left to spend</td>
                <td className={`py-2 text-right text-[15px] font-extrabold tabular-nums ${closing < 0 ? "text-danger" : "text-text"}`}>{formatCurrency(closing)}</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-4">
            <FlowBars income={income} expenses={expenses} />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[15px] font-bold text-text">Income and expenses by month</div>
            <div className="flex items-center gap-3 text-[12px] text-text-secondary">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--color-success)" }} />Income</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--color-danger)" }} />Expenses</span>
            </div>
          </div>
          <div className="mt-3">
            <TrendBars trend={trend} />
          </div>
        </div>
      </div>

      {byCategory.length > 0 && <PieChart title="Expenses by category" slices={byCategory} />}
    </section>
  );
}
