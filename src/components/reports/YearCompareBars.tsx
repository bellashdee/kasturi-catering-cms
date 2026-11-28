import { formatCurrency } from "@/lib/format";
import { MONTH_LABEL } from "@/lib/finance/constants";

const compact = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)));

/**
 * Two bars for every month, side by side: last year (light) and this year (dark), so each month is compared at a glance.
 * A month of this year that has not come yet has no bar.
 */
export function YearCompareBars({
  previous,
  current,
  previousLabel,
  currentLabel,
  lastMonth,
}: {
  previous: number[];
  current: number[];
  previousLabel: string;
  currentLabel: string;
  /** months of the current year that have a figure to show (12 for a past year) */
  lastMonth: number;
}) {
  const W = 760;
  const H = 220;
  const top = 18;
  const left = 8;
  const right = 44;
  const max = Math.max(...previous, ...current.slice(0, lastMonth), 1);
  const slot = (W - left - right) / 12;
  const bar = Math.min(22, slot * 0.36);
  const y = (v: number) => top + H - (v / max) * H;
  const PREV = "var(--chart-soft)";
  const CUR = "var(--chart-main)";

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] font-semibold text-text-secondary [print-color-adjust:exact]">
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: PREV }} />{previousLabel}</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: CUR }} />{currentLabel}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${top + H + 24}`} role="img" aria-label={`Sales by month: ${previousLabel} and ${currentLabel}`} className="w-full [print-color-adjust:exact]">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={left} x2={W - right + 8} y1={top + H - f * H} y2={top + H - f * H} style={{ stroke: "var(--color-border)" }} strokeWidth="1" />
            <text x={W} y={top + H - f * H + 3} textAnchor="end" fontSize="10" style={{ fill: "var(--color-text-secondary)" }}>{compact(max * f)}</text>
          </g>
        ))}
        {MONTH_LABEL.map((m, i) => {
          const cx = left + slot * i + slot / 2;
          const p = previous[i] ?? 0;
          const c = current[i] ?? 0;
          const showCur = i < lastMonth;
          return (
            <g key={m}>
              {p > 0 && (
                <rect x={cx - bar - 1} y={y(p)} width={bar} height={top + H - y(p)} rx="3" style={{ fill: PREV }}>
                  <title>{`${m} ${previousLabel}: ${formatCurrency(p)}`}</title>
                </rect>
              )}
              {showCur && c > 0 && (
                <rect x={cx + 1} y={y(c)} width={bar} height={top + H - y(c)} rx="3" style={{ fill: CUR }}>
                  <title>{`${m} ${currentLabel}: ${formatCurrency(c)}`}</title>
                </rect>
              )}
              <text x={cx} y={top + H + 16} textAnchor="middle" fontSize="11" style={{ fill: "var(--color-text-secondary)" }}>{m.slice(0, 3)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
