import { MONTH_LABEL } from "@/lib/finance/constants";
import { SectionCard } from "@/components/dashboard/SectionCard";

export type BreakdownSegment = { key: string; label: string; color: string; values: (number | null)[] };

const compact = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)));

/**
 * Where each month's sales went: one bar per month that fills 100% of that month's total sales, split into the cost lines and the net
 * profit (a loss shows no green). A month whose costs are not all entered yet shows a dashed bar, never a made-up split.
 */
export function MonthlyBreakdownChart({ title, sales, segments }: { title: string; sales: (number | null)[]; segments: BreakdownSegment[] }) {
  const W = 720;
  const H = 200;
  const top = 22;
  const groupW = W / 12;
  const bw = groupW * 0.62;

  return (
    <SectionCard title={title}>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-semibold text-text-secondary [print-color-adjust:exact]">
        {segments.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: s.color }} />{s.label}</span>
        ))}
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm border border-dashed" style={{ borderColor: "var(--color-text-secondary)" }} />costs not entered yet</span>
      </div>
      <svg viewBox={`0 0 ${W} ${top + H + 22}`} role="img" aria-label="Share of sales spent on each cost line per month" className="w-full [print-color-adjust:exact]">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={0} x2={W} y1={top + H - f * H} y2={top + H - f * H} style={{ stroke: "var(--color-border)" }} strokeWidth="1" />
            <text x={W} y={top + H - f * H - 3} textAnchor="end" fontSize="9" style={{ fill: "var(--color-text-secondary)" }}>{f * 100}%</text>
          </g>
        ))}
        {MONTH_LABEL.map((m, i) => {
          const s = sales[i];
          const x = i * groupW + (groupW - bw) / 2;
          const complete = s !== null && s > 0 && segments.every((g) => g.values[i] !== null);
          let y = top + H;
          const parts = complete ? segments.map((g) => ({ g, v: Math.max(g.values[i] as number, 0) })) : [];
          const total = parts.reduce((t, p) => t + p.v, 0) || 1;
          return (
            <g key={m}>
              {s !== null && <text x={x + bw / 2} y={top - 6} textAnchor="middle" fontSize="9" style={{ fill: "var(--color-text-secondary)" }}>{compact(s)}</text>}
              {complete
                ? parts.map((p) => {
                    const h = (p.v / total) * H;
                    y -= h;
                    return h > 0 ? (
                      <rect key={p.g.key} x={x} y={y} width={bw} height={h} style={{ fill: p.g.color }}>
                        <title>{`${m} · ${p.g.label}: ${(((p.g.values[i] as number) / (s as number)) * 100).toFixed(1)}% of sales`}</title>
                      </rect>
                    ) : null;
                  })
                : s !== null && <rect x={x} y={top} width={bw} height={H} fill="none" strokeDasharray="3 3" style={{ stroke: "var(--color-text-secondary)" }} strokeWidth="1" />}
              <text x={x + bw / 2} y={top + H + 15} textAnchor="middle" fontSize="10" style={{ fill: "var(--color-text-secondary)" }}>{m.slice(0, 3)}</text>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-[11.5px] text-text-secondary">The figure above each bar is that month&apos;s total sales (RM).</p>
    </SectionCard>
  );
}
