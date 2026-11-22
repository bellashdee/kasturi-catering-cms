import { formatCurrency } from "@/lib/format";

/**
 * The Company Summary as one picture: a rose band with the main figures, the year month by month and the share of revenue spent,
 * then the selected month's figures with the cost by module. Every number is a recorded figure; nothing is a target or an estimate.
 * Plain server-rendered SVG / HTML, so it prints exactly as it looks (backgrounds are kept in the print).
 */

const ROSE = "var(--color-navy-700)";
const ROSE_DARK = "var(--color-navy-900)";
const ROSE_PALE = "var(--color-info-bg)";

type Series = number[];

export type SummaryPictureProps = {
  periodLabel: string;
  year: number;
  /** months 1..12 of the chosen year */
  revenueByMonth: Series;
  costByMonth: Series;
  /** the month shown below (1..12) */
  month: number;
  revenue: number;
  /** the payments received in the period (the revenue above is the sales keyed in) */
  received?: number;
  totalCost: number;
  net: number;
  bySource: { source: string; amount: number }[];
  activeStaff: number;
  activeCampaigns: number;
  productionOrders: number;
  deliveries: number;
  supplierOutstanding: number;
  customerOutstanding: number;
  /** O2 Life (the restaurant) is the only company viewed: no deliveries, production orders or customer invoices */
  restaurant?: boolean;
};

const sum = (a: Series) => a.reduce((t, v) => t + v, 0);

/** The 12 months as white bars; the exact amount is the tooltip, the month number sits under each bar. */
function MonthBars({ values, label, current, tone }: { values: Series; label: string; current: number; tone: "light" | "dark" }) {
  const max = Math.max(...values, 0);
  const W = 300;
  const H = 96;
  const gap = 8;
  const bw = (W - gap * 11) / 12;
  const fill = tone === "light" ? "#ffffff" : ROSE_DARK;
  return (
    <svg viewBox={`0 0 ${W} ${H + 16}`} role="img" aria-label={label} className="mt-3 w-full">
      {values.map((v, i) => {
        const h = max > 0 ? Math.max((v / max) * H, v > 0 ? 3 : 0) : 0;
        const x = i * (bw + gap);
        return (
          <g key={i}>
            <rect x={x} y={H - h} width={bw} height={h} rx="1.5" style={{ fill }} opacity={i + 1 === current ? 1 : 0.78}>
              <title>{`${i + 1}: ${formatCurrency(v)}`}</title>
            </rect>
            <text x={x + bw / 2} y={H + 12} textAnchor="middle" fontSize="8.5" style={{ fill: tone === "light" ? "#ffffff" : ROSE_DARK }} fontWeight={i + 1 === current ? 800 : 500}>
              {i + 1}
            </text>
          </g>
        );
      })}
      <line x1="0" x2={W} y1={H} y2={H} style={{ stroke: fill }} strokeOpacity="0.35" strokeWidth="1" />
    </svg>
  );
}

/** A ring showing a share (0..100). */
function Ring({ percent }: { percent: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const p = Math.min(Math.max(percent, 0), 100);
  return (
    <svg viewBox="0 0 140 140" className="mx-auto w-full max-w-[210px]" role="img" aria-label={`${p.toFixed(0)}%`}>
      <circle cx="70" cy="70" r={r} fill="none" style={{ stroke: ROSE_DARK }} strokeOpacity="0.55" strokeWidth="16" />
      <circle cx="70" cy="70" r={r} fill="none" stroke="#ffffff" strokeWidth="16" strokeDasharray={`${(p / 100) * c} ${c}`} transform="rotate(-90 70 70)" />
    </svg>
  );
}

function Tile({ value, label, tone }: { value: string; label: string; tone?: "bad" }) {
  return (
    <div className="border-b border-white/40 px-1 py-3.5 last:border-b-0">
      <div className={`text-[26px] font-extrabold leading-tight ${tone === "bad" ? "text-[#6e1414]" : "text-white"}`}>{value}</div>
      <div className="mt-0.5 text-[11.5px] font-semibold uppercase tracking-wider text-white/90">{label}</div>
    </div>
  );
}

function Pill({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="text-center">
      <div className="text-[12px] font-bold uppercase tracking-wider text-[color:var(--soft-label)]">{label}</div>
      <div className="mt-1.5 rounded-2xl px-4 py-3 text-[28px] font-extrabold leading-none text-white" style={{ background: ROSE }}>
        {value}
      </div>
    </div>
  );
}

export function SummaryInfographic(p: SummaryPictureProps) {
  const monthsWithFigures = (a: Series, b: Series) => a.filter((v, i) => v > 0 || b[i] > 0).length;
  // year to date = January up to the chosen month
  const ytdRevenue = sum(p.revenueByMonth.slice(0, p.month));
  const ytdCost = sum(p.costByMonth.slice(0, p.month));
  const ytdNet = ytdRevenue - ytdCost;
  const ytdMonths = monthsWithFigures(p.revenueByMonth.slice(0, p.month), p.costByMonth.slice(0, p.month));
  const avgRevenue = ytdMonths > 0 ? ytdRevenue / ytdMonths : 0;
  const avgCost = ytdMonths > 0 ? ytdCost / ytdMonths : 0;
  const spentPercent = ytdRevenue > 0 ? (ytdCost / ytdRevenue) * 100 : 0;
  const margin = p.revenue > 0 ? (p.net / p.revenue) * 100 : null;
  const maxSource = Math.max(...p.bySource.map((s) => s.amount), 0);

  return (
    <div className="overflow-hidden rounded-2xl border border-border shadow-sm [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
      {/* the main figures */}
      <div className="grid gap-px text-white md:grid-cols-[1.1fr_1.5fr_1.1fr]" style={{ background: ROSE_DARK }}>
        <div className="px-6 py-3" style={{ background: ROSE }}>
          <Tile value={formatCurrency(p.revenue)} label={`Sales · ${p.periodLabel}`} />
          {p.received !== undefined && <Tile value={formatCurrency(p.received)} label={`Money received · ${p.periodLabel}`} />}
          <Tile value={formatCurrency(p.totalCost)} label={`Total cost · ${p.periodLabel}`} />
          <Tile value={formatCurrency(p.net)} label={`Net · ${p.periodLabel}`} tone={p.net < 0 ? "bad" : undefined} />
          <Tile value={margin === null ? "—" : `${margin.toFixed(1)}%`} label="Net margin" />
        </div>

        <div className="flex flex-col gap-5 px-6 py-5" style={{ background: ROSE }}>
          <div>
            <div className="text-center">
              <div className="text-[28px] font-extrabold">{formatCurrency(avgRevenue)}</div>
              <div className="text-[11.5px] font-semibold uppercase tracking-wider text-white/90">{`Average monthly revenue · ${p.year}`}</div>
            </div>
            <MonthBars values={p.revenueByMonth} label={`Revenue by month ${p.year}`} current={p.month} tone="light" />
          </div>
          <div>
            <div className="text-center">
              <div className="text-[28px] font-extrabold">{formatCurrency(avgCost)}</div>
              <div className="text-[11.5px] font-semibold uppercase tracking-wider text-white/90">{`Average monthly cost · ${p.year}`}</div>
            </div>
            <MonthBars values={p.costByMonth} label={`Cost by month ${p.year}`} current={p.month} tone="light" />
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-3 px-6 py-5 text-center" style={{ background: ROSE }}>
          <div>
            <div className="text-[34px] font-extrabold leading-none">{formatCurrency(ytdRevenue)}</div>
            <div className="mt-1 text-[12.5px] font-semibold uppercase tracking-wider text-white/90">{`Revenue · ${p.year} to date`}</div>
          </div>
          <div className="relative w-full">
            <Ring percent={spentPercent} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-[34px] font-extrabold leading-none">{ytdRevenue > 0 ? `${spentPercent.toFixed(0)}%` : "—"}</div>
              <div className="mt-1 text-[12px] font-semibold uppercase tracking-wider">of revenue spent</div>
              <div className="mt-1 text-[12px] font-bold" style={{ color: ROSE_PALE }}>{formatCurrency(ytdCost)}</div>
            </div>
          </div>
          <div className="text-[12px] font-semibold uppercase tracking-wider text-white/90">{`Net · ${p.year} to date: ${formatCurrency(ytdNet)}`}</div>
        </div>
      </div>

      {/* the selected month */}
      <div className="bg-surface px-6 py-5">
        <div className="text-center text-[15px] font-extrabold uppercase tracking-wide text-text">{`Selected period: ${p.periodLabel}`}</div>
        <div className="mt-4 grid gap-6 md:grid-cols-[1fr_1.4fr]">
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 self-start">
            <Pill value={p.activeStaff} label="Active staff" />
            {!p.restaurant && <Pill value={p.deliveries} label="Deliveries" />}
            {!p.restaurant && <Pill value={p.productionOrders} label="Production orders" />}
            <Pill value={p.activeCampaigns} label="Active campaigns" />
            <Pill value={formatCurrency(p.supplierOutstanding)} label="Supplier outstanding" />
            {!p.restaurant && <Pill value={formatCurrency(p.customerOutstanding)} label="Customer outstanding" />}
          </div>

          <div>
            <div className="text-[12.5px] font-bold uppercase tracking-wider text-[color:var(--soft-label)]">Cost by module</div>
            {p.bySource.length === 0 ? (
              <div className="py-6 text-[13px] text-text-secondary">No costs recorded for this period.</div>
            ) : (
              <ul className="mt-3 flex flex-col gap-2.5">
                {p.bySource.map((s) => (
                  <li key={s.source}>
                    <div className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="min-w-0 break-words font-semibold text-text">{s.source}</span>
                      <span className="shrink-0 font-bold tabular-nums text-text">{formatCurrency(s.amount)}</span>
                    </div>
                    <div className="mt-1 h-2.5 rounded-full" style={{ background: ROSE_PALE }}>
                      <div className="h-2.5 rounded-full" style={{ width: `${maxSource > 0 ? Math.max((s.amount / maxSource) * 100, 1.5) : 0}%`, background: ROSE }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
