import { formatCurrency } from "@/lib/format";

/**
 * The Monthly Costing Report as pictures: the main figures, the last six months module by module (with the sales), every day of the
 * period, the biggest categories and the departments. Every figure is a recorded cost; plain server-rendered SVG / HTML so it prints
 * as it looks. One company at a time: the figures are of the company (or companies) chosen at the top only.
 */

export type CostingChartRow = { date: string; source: string; category: string; department: string | null; amount: number };
export type CostingMonth = { month: string; sales: number | null; rows: CostingChartRow[] };

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortMonth = (ym: string) => `${MONTH_SHORT[Number(ym.slice(5, 7)) - 1] ?? ym} ${ym.slice(2, 4)}`;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const sum = (rows: { amount: number }[]) => round2(rows.reduce((t, r) => t + r.amount, 0));
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(Math.round(n)));
const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—");

/** One colour for each module, the same in every chart. */
const MODULE_ORDER = ["Company Expenses", "Petty Cash", "Finance Payments", "Supplier", "Kitchen", "Catering", "Driver", "Marketing", "HR"];
const moduleColour = (source: string) => `var(--chart-${(Math.max(MODULE_ORDER.indexOf(source), 0) % 10) + 1})`;

function Card({ title, sub, children, className = "" }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-surface p-5 shadow-sm ${className}`}>
      <div className="text-[15px] font-bold text-text">{title}</div>
      {sub && <div className="mt-0.5 text-[12.5px] text-text-secondary">{sub}</div>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Tile({ label, value, sub, colour }: { label: string; value: string; sub?: string; colour: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface text-center shadow-sm">
      <div className="h-1.5" style={{ background: colour }} />
      <div className="px-4 py-3.5">
        <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">{label}</div>
        <div className="mt-1 text-[24px] font-extrabold leading-tight tabular-nums" style={{ color: colour }}>{value}</div>
        {sub && <div className="mt-0.5 text-[12px] text-text-secondary">{sub}</div>}
      </div>
    </div>
  );
}

function Legend({ items }: { items: string[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-text-secondary">
      {items.map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: moduleColour(s) }} />
          {s}
        </span>
      ))}
    </div>
  );
}

/** The last months side by side: each bar is stacked by module, the sales are a line of dots above. */
function MonthStack({ months, chosen }: { months: CostingMonth[]; chosen: string }) {
  const W = 420;
  const H = 150;
  const top = 18;
  const base = top + H;
  const totals = months.map((m) => sum(m.rows));
  const max = Math.max(...totals, ...months.map((m) => m.sales ?? 0), 1);
  const slot = W / months.length;
  const bw = Math.min(34, slot / 2);
  const y = (v: number) => base - (v / max) * H;
  const salesPoints = months.map((m, i) => (m.sales !== null && m.sales > 0 ? { x: slot * i + slot / 2, y: y(m.sales), v: m.sales } : null));
  return (
    <svg viewBox={`0 0 ${W} ${base + 22}`} className="w-full" role="img" aria-label="Cost by month, by module">
      <line x1="0" x2={W} y1={base} y2={base} style={{ stroke: "var(--color-border-strong)" }} strokeWidth="1" />
      {months.map((m, i) => {
        const cx = slot * i + slot / 2;
        let y0 = base;
        const parts = MODULE_ORDER.map((s) => ({ s, v: sum(m.rows.filter((r) => r.source === s)) })).filter((p) => p.v > 0);
        return (
          <g key={m.month} opacity={m.month === chosen ? 1 : 0.7}>
            {parts.map((p) => {
              const h = (p.v / max) * H;
              y0 -= h;
              return (
                <rect key={p.s} x={cx - bw / 2} y={y0} width={bw} height={h} style={{ fill: moduleColour(p.s) }}>
                  <title>{`${shortMonth(m.month)} · ${p.s}: ${formatCurrency(p.v)}`}</title>
                </rect>
              );
            })}
            {totals[i] > 0 && (
              <text x={cx} y={y(totals[i]) - 4} textAnchor="middle" fontSize="9.5" fontWeight="700" style={{ fill: "var(--color-text)" }}>{compact(totals[i])}</text>
            )}
            <text x={cx} y={base + 15} textAnchor="middle" fontSize="11" fontWeight={m.month === chosen ? 800 : 600} style={{ fill: m.month === chosen ? "var(--color-text)" : "var(--color-text-secondary)" }}>
              {shortMonth(m.month)}
            </text>
          </g>
        );
      })}
      {salesPoints.map((p, i) =>
        p ? (
          <g key={`s${i}`}>
            <line x1={p.x - bw / 2 - 4} x2={p.x + bw / 2 + 4} y1={p.y} y2={p.y} style={{ stroke: "var(--color-success)" }} strokeWidth="2.5" strokeDasharray="4 2" />
            <title>{`Sales: ${formatCurrency(p.v)}`}</title>
          </g>
        ) : null,
      )}
    </svg>
  );
}

/** Every day of the period as a bar (the days with no cost are left empty). */
function DayBars({ days }: { days: { day: string; total: number }[] }) {
  const W = 620;
  const H = 120;
  const max = Math.max(...days.map((d) => d.total), 1);
  const slot = W / Math.max(days.length, 1);
  const bw = Math.max(Math.min(14, slot - 3), 2);
  const every = days.length > 16 ? 2 : 1;
  return (
    <svg viewBox={`0 0 ${W} ${H + 34}`} className="w-full" role="img" aria-label="Cost by day">
      <line x1="0" x2={W} y1={H + 14} y2={H + 14} style={{ stroke: "var(--color-border-strong)" }} strokeWidth="1" />
      {days.map((d, i) => {
        const cx = slot * i + slot / 2;
        const h = (d.total / max) * H;
        return (
          <g key={d.day}>
            {d.total > 0 && (
              <rect x={cx - bw / 2} y={H + 14 - h} width={bw} height={h} rx="1.5" style={{ fill: "var(--color-danger)" }}>
                <title>{`${d.day}: ${formatCurrency(d.total)}`}</title>
              </rect>
            )}
            {i % every === 0 && (
              <text x={cx} y={H + 28} textAnchor="middle" fontSize="9.5" style={{ fill: "var(--color-text-secondary)" }}>{Number(d.day.slice(8, 10))}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Ranked bars with the amount and the share of the total; each bar is split by module. */
function RankBars({ items, total }: { items: { label: string; amount: number; bySource: { source: string; amount: number }[] }[]; total: number }) {
  const max = Math.max(...items.map((i) => i.amount), 1);
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((it) => (
        <div key={it.label}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate font-semibold text-text" title={it.label}>{it.label}</span>
            <span className="shrink-0 tabular-nums text-text">
              <strong>{formatCurrency(it.amount)}</strong> <span className="text-text-muted">{pct(it.amount, total)}</span>
            </span>
          </div>
          <div className="mt-1 flex h-3 overflow-hidden rounded-full bg-surface-alt" style={{ width: `${Math.max((it.amount / max) * 100, 2)}%` }}>
            {it.bySource.map((s) => (
              <div key={s.source} title={`${s.source}: ${formatCurrency(s.amount)}`} style={{ width: `${(s.amount / it.amount) * 100}%`, background: moduleColour(s.source) }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function group(rows: CostingChartRow[], key: (r: CostingChartRow) => string) {
  const map = new Map<string, CostingChartRow[]>();
  for (const r of rows) map.set(key(r), [...(map.get(key(r)) ?? []), r]);
  return Array.from(map, ([label, list]) => ({
    label,
    amount: sum(list),
    count: list.length,
    bySource: MODULE_ORDER.map((source) => ({ source, amount: sum(list.filter((r) => r.source === source)) })).filter((s) => s.amount > 0),
  })).sort((a, b) => b.amount - a.amount);
}

export function CostingCharts({
  rows,
  months,
  chosenMonth,
  periodLabel,
  periodDays,
  sales,
}: {
  /** the costs of the period shown (after the filters) */
  rows: CostingChartRow[];
  /** the last six months, ending with the chosen month (after the same filters) */
  months: CostingMonth[];
  chosenMonth: string;
  periodLabel: string;
  /** every day of the period, YYYY-MM-DD */
  periodDays: string[];
  /** the sales of the chosen month (null for a custom date range) */
  sales: number | null;
}) {
  const total = sum(rows);
  const previous = months.length > 1 ? months[months.length - 2] : null;
  const previousTotal = previous ? sum(previous.rows) : null;
  const change = previousTotal !== null ? round2(total - previousTotal) : null;
  const net = sales !== null ? round2(sales - total) : null;
  const modules = MODULE_ORDER.filter((s) => months.some((m) => m.rows.some((r) => r.source === s)) || rows.some((r) => r.source === s));

  const days = periodDays.map((day) => ({ day, total: sum(rows.filter((r) => r.date === day)) }));
  const spendingDays = days.filter((d) => d.total > 0);
  const busiest = spendingDays.reduce<{ day: string; total: number } | null>((best, d) => (!best || d.total > best.total ? d : best), null);
  const categories = group(rows, (r) => r.category.trim() || "Other");
  const departments = group(rows, (r) => r.department?.trim() || "No department");
  const byModule = group(rows, (r) => r.source);
  const dayLabel = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTH_SHORT[Number(iso.slice(5, 7)) - 1]}`;

  return (
    <section className="flex flex-col gap-4" aria-label="Costing charts">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Total cost" value={formatCurrency(total)} sub={`${rows.length} record${rows.length === 1 ? "" : "s"} · ${periodLabel}`} colour="var(--color-danger)" />
        <Tile label="Sales" value={sales !== null ? formatCurrency(sales) : "—"} sub={sales !== null ? "Recorded for the month" : "Shown for a whole month only"} colour="var(--color-success)" />
        <Tile
          label={net !== null && net < 0 ? "Loss" : "Profit"}
          value={net !== null ? formatCurrency(Math.abs(net)) : "—"}
          sub={net !== null && sales ? `${((net / sales) * 100).toFixed(1)}% of sales` : "Sales minus cost"}
          colour={net !== null && net < 0 ? "var(--color-danger)" : "var(--color-primary)"}
        />
        <Tile
          label="Vs last month"
          value={change !== null ? `${change > 0 ? "+" : change < 0 ? "−" : ""}${formatCurrency(Math.abs(change))}` : "—"}
          sub={previous && previousTotal !== null ? `${shortMonth(previous.month)}: ${formatCurrency(previousTotal)}` : undefined}
          colour={change !== null && change > 0 ? "var(--color-danger)" : "var(--color-success)"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card title="Cost by month, by module" sub="The last 6 months; the dashed green line is the sales of the month">
          <MonthStack months={months} chosen={chosenMonth} />
          <Legend items={modules} />
        </Card>
        <Card title="Cost by module" sub={periodLabel}>
          <RankBars items={byModule} total={total} />
          <table className="mt-4 w-full text-[13px]">
            <tbody>
              {byModule.map((m) => (
                <tr key={m.label} className="border-t border-border">
                  <td className="py-1.5 text-text-secondary">{m.label}</td>
                  <td className="py-1.5 text-right text-text-muted">{`${m.count} record${m.count === 1 ? "" : "s"}`}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums text-text">{formatCurrency(m.amount)}</td>
                </tr>
              ))}
              <tr className="border-t border-border-strong">
                <td className="py-1.5 font-bold text-text">Total</td>
                <td className="py-1.5 text-right text-text-muted">{`${rows.length}`}</td>
                <td className="py-1.5 text-right font-extrabold tabular-nums text-text">{formatCurrency(total)}</td>
              </tr>
            </tbody>
          </table>
        </Card>
      </div>

      <Card
        title="Cost by day"
        sub={
          spendingDays.length > 0
            ? `${spendingDays.length} day${spendingDays.length === 1 ? "" : "s"} with spending · average ${formatCurrency(round2(total / spendingDays.length))} a day${busiest ? ` · highest ${dayLabel(busiest.day)}: ${formatCurrency(busiest.total)}` : ""}`
            : "No spending in the period"
        }
      >
        <DayBars days={days} />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Top categories" sub={`The ${Math.min(categories.length, 12)} biggest of ${categories.length}; each bar is split by module`}>
          <RankBars items={categories.slice(0, 12)} total={total} />
          {modules.length > 1 && <Legend items={modules} />}
        </Card>
        <Card title="Cost by department" sub={departments.length === 1 && departments[0].label === "No department" ? "No department is recorded on these costs" : periodLabel}>
          <RankBars items={departments} total={total} />
        </Card>
      </div>
    </section>
  );
}
