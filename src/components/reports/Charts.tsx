import { formatCurrency } from "@/lib/format";
import { MONTH_LABEL } from "@/lib/finance/constants";
import { EmptyRow } from "@/components/dashboard/SectionCard";

/** One palette for every chart, so the same kind of thing has the same colour on every page. */
export const CHART_COLORS = ["#1e3a5f", "#2f7fc1", "#e0a030", "#2e9e6b", "#b8794a", "#7fb8e6", "#8a8f98"];
export const RED = "#b42318";

const compact = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)));
const pct = (v: number, total: number) => (total > 0 ? `${((v / total) * 100).toFixed(1)}%` : "—");

export type Slice = { label: string; value: number; color?: string; note?: string };

/**
 * A ring for parts of a whole (the share of expenses, the share of revenue): the total in the middle and a legend that lists every part
 * with its amount and share, so the ring and the figures always say the same.
 */
export function DonutChart({ slices, centerLabel, empty }: { slices: Slice[]; centerLabel: string; empty: string }) {
  const parts = slices.filter((s) => s.value > 0);
  const total = parts.reduce((t, s) => t + s.value, 0);
  if (parts.length === 0) return <EmptyRow text={empty} />;
  const R = 70;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <svg viewBox="0 0 200 200" role="img" aria-label={centerLabel} className="h-44 w-44 shrink-0 [print-color-adjust:exact]">
        <g transform="rotate(-90 100 100)">
          {parts.map((s, i) => {
            const len = (s.value / total) * C;
            const el = (
              <circle key={s.label} cx="100" cy="100" r={R} fill="none" strokeWidth="26" stroke={s.color ?? CHART_COLORS[i % CHART_COLORS.length]} strokeDasharray={`${Math.max(len - 1.5, 0)} ${C - Math.max(len - 1.5, 0)}`} strokeDashoffset={-offset}>
                <title>{`${s.label}: ${formatCurrency(s.value)} (${pct(s.value, total)})`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
        </g>
        <text x="100" y="94" textAnchor="middle" fontSize="11" style={{ fill: "var(--color-text-secondary)" }}>{centerLabel}</text>
        <text x="100" y="114" textAnchor="middle" fontSize="15" fontWeight="800" style={{ fill: "var(--color-text)" }}>{`RM ${compact(total)}`}</text>
      </svg>
      <ul className="w-full min-w-0 flex-1 divide-y divide-border text-[13px]">
        {parts.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2.5 py-1.5">
            <span className="h-3 w-3 shrink-0 rounded-sm [print-color-adjust:exact]" style={{ background: s.color ?? CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate font-semibold text-text" title={s.label}>{s.label}{s.note && <span className="font-normal text-text-secondary"> · {s.note}</span>}</span>
            <span className="shrink-0 tabular-nums text-text">{formatCurrency(s.value)}</span>
            <span className="w-12 shrink-0 text-right tabular-nums text-text-secondary">{pct(s.value, total)}</span>
          </li>
        ))}
        <li className="flex items-center gap-2.5 py-1.5 font-bold">
          <span className="h-3 w-3 shrink-0" />
          <span className="flex-1 text-text">Total</span>
          <span className="tabular-nums text-text">{formatCurrency(total)}</span>
          <span className="w-12 shrink-0 text-right text-text-secondary">100%</span>
        </li>
      </ul>
    </div>
  );
}

export type Series = { label: string; values: (number | null)[]; color: string };

/** Lines over the months of a year (money in and money out): a dot for every month with a figure; months that have not come yet are not drawn. */
export function TrendLines({ series }: { series: Series[] }) {
  const W = 720;
  const H = 210;
  const top = 14;
  const left = 8;
  const right = 40;
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const max = Math.max(...all, 1);
  const step = (W - left - right) / 11;
  const x = (i: number) => left + i * step;
  const y = (v: number) => top + H - (v / max) * H;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] font-semibold text-text-secondary [print-color-adjust:exact]">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5"><span className="inline-block h-[3px] w-5 rounded" style={{ background: s.color }} />{s.label} <b className="text-text">{formatCurrency(s.values.reduce<number>((t, v) => t + (v ?? 0), 0))}</b></span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${top + H + 22}`} role="img" aria-label="Money by month" className="w-full [print-color-adjust:exact]">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={left} x2={W - right + 8} y1={top + H - f * H} y2={top + H - f * H} style={{ stroke: "var(--color-border)" }} strokeWidth="1" />
            <text x={W} y={top + H - f * H + 3} textAnchor="end" fontSize="9" style={{ fill: "var(--color-text-secondary)" }}>{compact(max * f)}</text>
          </g>
        ))}
        {series.map((s) => {
          const pts = s.values.map((v, i) => (v === null ? null : { i, v })).filter((p): p is { i: number; v: number } => p !== null);
          return (
            <g key={s.label}>
              <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={pts.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")} />
              {pts.map((p) => (
                <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r="3.5" fill="white" stroke={s.color} strokeWidth="2"><title>{`${MONTH_LABEL[p.i]} · ${s.label}: ${formatCurrency(p.v)}`}</title></circle>
              ))}
            </g>
          );
        })}
        {MONTH_LABEL.map((m, i) => (
          <text key={m} x={x(i)} y={top + H + 16} textAnchor="middle" fontSize="10" style={{ fill: "var(--color-text-secondary)" }}>{m.slice(0, 3)}</text>
        ))}
      </svg>
    </div>
  );
}

export type Column = { label: string; value: number; note?: string };

/** Upright bars for a few names (the sales agents): the amount above each bar and the name below. */
export function ColumnChart({ items, color = "#2f7fc1", empty }: { items: Column[]; color?: string; empty: string }) {
  if (items.length === 0) return <EmptyRow text={empty} />;
  const max = Math.max(...items.map((i) => i.value), 1);
  const total = items.reduce((t, i) => t + i.value, 0);
  return (
    <div className="flex items-end justify-around gap-3 pt-2" style={{ minHeight: 230 }}>
      {items.map((c) => (
        <div key={c.label} className="flex min-w-0 flex-1 flex-col items-center gap-1" style={{ maxWidth: 140 }}>
          <div className="text-[12.5px] font-bold tabular-nums text-text">{compact(c.value)}</div>
          <div className="text-[11px] text-text-secondary">{pct(c.value, total)}</div>
          <div className="flex w-full items-end justify-center" style={{ height: 150 }}>
            <div className="w-3/5 rounded-t-md [print-color-adjust:exact]" style={{ height: `${Math.max((c.value / max) * 100, 2)}%`, background: color }} title={`${c.label}: ${formatCurrency(c.value)}`} />
          </div>
          <div className="w-full truncate text-center text-[12.5px] font-semibold text-text" title={c.label}>{c.label}</div>
          {c.note && <div className="w-full truncate text-center text-[11px] text-text-secondary" title={c.note}>{c.note}</div>}
        </div>
      ))}
    </div>
  );
}

/** One bar split into parts (how old the unpaid invoices are): the width of each part is its share, with its amount and share in the legend. */
export function StackedBar({ segments }: { segments: Slice[] }) {
  const total = segments.reduce((t, s) => t + s.value, 0);
  if (total <= 0) return null;
  return (
    <div>
      <div className="flex h-7 w-full overflow-hidden rounded-lg [print-color-adjust:exact]">
        {segments.filter((s) => s.value > 0).map((s) => (
          <div key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} title={`${s.label}: ${formatCurrency(s.value)} (${pct(s.value, total)})`} />
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] sm:grid-cols-3 lg:grid-cols-5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-start gap-1.5">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm [print-color-adjust:exact]" style={{ background: s.color }} />
            <div>
              <div className="font-semibold text-text">{s.label}</div>
              <div className="tabular-nums text-text-secondary">{formatCurrency(s.value)} · {pct(s.value, total)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
