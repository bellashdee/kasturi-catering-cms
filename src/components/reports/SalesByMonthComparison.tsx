import { formatCurrency } from "@/lib/format";
import { MONTH_LABEL } from "@/lib/finance/constants";
import { SectionCard } from "@/components/dashboard/SectionCard";

/** Sales (customer payments received) month by month: the chosen year against the year before. Recorded figures only. */
export function SalesByMonthComparison({ year, current, previous }: { year: number; current: number[]; previous: number[] }) {
  const max = Math.max(...current, ...previous, 0);
  const totalCurrent = current.reduce((t, v) => t + v, 0);
  const totalPrevious = previous.reduce((t, v) => t + v, 0);

  const change = (now: number, before: number) => {
    const diff = now - before;
    const pct = before > 0 ? `${diff >= 0 ? "+" : ""}${((diff / before) * 100).toFixed(1)}%` : now > 0 ? "New" : "—";
    return { diff, pct };
  };
  const W = 720;
  const H = 220;
  const padL = 8;
  const groupW = (W - padL) / 12;
  const bw = groupW * 0.32;
  const compact = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)));
  const barH = (v: number) => (max > 0 ? Math.max((v / max) * H, v > 0 ? 2 : 0) : 0);

  return (
    <SectionCard title={`Sales by Month — ${year} vs ${year - 1}`}>
      <div className="mb-2 flex items-center gap-4 text-[12px] font-semibold text-text-secondary [print-color-adjust:exact]">
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: "var(--color-navy-700)" }} />{year}</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: "var(--color-info-bg)", border: "1px solid var(--color-navy-700)" }} />{year - 1}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 36}`} role="img" aria-label={`Sales by month ${year} compared with ${year - 1}`} className="w-full [print-color-adjust:exact]">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={padL} x2={W} y1={20 + H - f * H} y2={20 + H - f * H} style={{ stroke: "var(--color-border)" }} strokeWidth="1" />
            <text x={W} y={16 + H - f * H} textAnchor="end" fontSize="9" style={{ fill: "var(--color-text-secondary)" }}>{compact(max * f)}</text>
          </g>
        ))}
        {MONTH_LABEL.map((label, i) => {
          const x = padL + i * groupW + groupW * 0.15;
          const cur = current[i] ?? 0;
          const prev = previous[i] ?? 0;
          return (
            <g key={label}>
              <rect x={x} y={20 + H - barH(cur)} width={bw} height={barH(cur)} rx="1.5" style={{ fill: "var(--color-navy-700)" }}><title>{`${label} ${year}: ${formatCurrency(cur)}`}</title></rect>
              <rect x={x + bw + 2} y={20 + H - barH(prev)} width={bw} height={barH(prev)} rx="1.5" style={{ fill: "var(--color-info-bg)", stroke: "var(--color-navy-700)" }} strokeWidth="1"><title>{`${label} ${year - 1}: ${formatCurrency(prev)}`}</title></rect>
              <text x={x + bw} y={20 + H + 14} textAnchor="middle" fontSize="10" fontWeight="600" style={{ fill: "var(--color-text)" }}>{label.slice(0, 3)}</text>
            </g>
          );
        })}
        <line x1={padL} x2={W} y1={20 + H} y2={20 + H} style={{ stroke: "var(--color-border)" }} strokeWidth="1" />
      </svg>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] uppercase tracking-wider text-text-secondary">
              <th className="py-2 pr-3 font-bold">Month</th>
              <th className="py-2 pr-3 text-right font-bold">{year}</th>
              <th className="py-2 pr-3 text-right font-bold">{year - 1}</th>
              <th className="py-2 pr-3 text-right font-bold">Difference</th>
              <th className="py-2 pr-3 text-right font-bold">%</th>
            </tr>
          </thead>
          <tbody>
            {MONTH_LABEL.map((label, i) => {
              const { diff, pct } = change(current[i] ?? 0, previous[i] ?? 0);
              return (
                <tr key={label} className="border-t border-border">
                  <td className="py-2 pr-3 font-semibold text-text">{label}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(current[i] ?? 0)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-text-secondary">{formatCurrency(previous[i] ?? 0)}</td>
                  <td className={`py-2 pr-3 text-right tabular-nums font-semibold ${diff < 0 ? "text-[#b42318]" : "text-text"}`}>{formatCurrency(diff)}</td>
                  <td className={`py-2 pr-3 text-right tabular-nums ${diff < 0 ? "text-[#b42318]" : "text-text"}`}>{pct}</td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-border font-extrabold">
              <td className="py-2 pr-3">Total</td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(totalCurrent)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(totalPrevious)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(totalCurrent - totalPrevious)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{change(totalCurrent, totalPrevious).pct}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
