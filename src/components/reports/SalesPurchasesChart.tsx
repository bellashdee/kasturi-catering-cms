import { formatCurrency } from "@/lib/format";
import { MONTH_LABEL } from "@/lib/finance/constants";
import { SectionCard } from "@/components/dashboard/SectionCard";

const compact = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)));

/** Sales invoiced against purchases, month by month: two bars for each month, and the year's totals underneath. Months with no figures are left empty. */
export function SalesPurchasesChart({ year, sales, purchases }: { year: number; sales: number[]; purchases: number[] }) {
  const W = 720;
  const H = 200;
  const top = 18;
  const groupW = W / 12;
  const bw = groupW * 0.32;
  const max = Math.max(...sales, ...purchases, 1);
  const barH = (v: number) => (v > 0 ? Math.max((v / max) * H, 2) : 0);
  const totalSales = sales.reduce((t, v) => t + v, 0);
  const totalPurchases = purchases.reduce((t, v) => t + v, 0);

  return (
    <SectionCard title={`Sales and Purchases by Month — ${year}`}>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-[12px] font-semibold text-text-secondary [print-color-adjust:exact]">
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: "var(--color-navy-700)" }} />Sales</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: "#e0a030" }} />Purchases</span>
        <span className="ml-auto text-text">Sales {formatCurrency(totalSales)} · Purchases {formatCurrency(totalPurchases)} · {totalSales > 0 ? `${((totalPurchases / totalSales) * 100).toFixed(1)}% of sales` : "—"}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${top + H + 22}`} role="img" aria-label={`Sales and purchases by month in ${year}`} className="w-full [print-color-adjust:exact]">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={0} x2={W} y1={top + H - f * H} y2={top + H - f * H} style={{ stroke: "var(--color-border)" }} strokeWidth="1" />
            <text x={W} y={top + H - f * H - 3} textAnchor="end" fontSize="9" style={{ fill: "var(--color-text-secondary)" }}>{compact(max * f)}</text>
          </g>
        ))}
        {MONTH_LABEL.map((m, i) => {
          const x = i * groupW + groupW * 0.18;
          return (
            <g key={m}>
              <rect x={x} y={top + H - barH(sales[i])} width={bw} height={barH(sales[i])} style={{ fill: "var(--color-navy-700)" }}><title>{`${m} · sales ${formatCurrency(sales[i])}`}</title></rect>
              <rect x={x + bw + 2} y={top + H - barH(purchases[i])} width={bw} height={barH(purchases[i])} fill="#e0a030"><title>{`${m} · purchases ${formatCurrency(purchases[i])}`}</title></rect>
              <text x={x + bw} y={top + H + 15} textAnchor="middle" fontSize="10" style={{ fill: "var(--color-text-secondary)" }}>{m.slice(0, 3)}</text>
            </g>
          );
        })}
      </svg>
    </SectionCard>
  );
}
