import { formatCurrency, malaysiaYearMonth } from "@/lib/format";
import { MONTH_LABEL } from "@/lib/finance/constants";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { TrendLines, type Series } from "@/components/reports/Charts";

/** Sales (the monthly sales keyed in; payments received for a month with none keyed) month by month: the chosen year against the year before. Recorded figures only. */
export function SalesByMonthComparison({ year, current, previous }: { year: number; current: number[]; previous: number[] }) {
  const totalCurrent = current.reduce((t, v) => t + v, 0);
  const totalPrevious = previous.reduce((t, v) => t + v, 0);

  const change = (now: number, before: number) => {
    const diff = now - before;
    const pct = before > 0 ? `${diff >= 0 ? "+" : ""}${((diff / before) * 100).toFixed(1)}%` : now > 0 ? "New" : "—";
    return { diff, pct };
  };
  // lines: a month that has not come yet is not drawn; a year with no figures at all is left out instead of a flat line at RM 0
  const now = malaysiaYearMonth();
  const lastMonth = year < now.year ? 12 : year > now.year ? 0 : now.month;
  const series: Series[] = [{ label: String(year), values: current.map((v, i) => (i < lastMonth ? v : null)), color: "#1e3a5f" }];
  if (totalPrevious > 0) series.push({ label: String(year - 1), values: previous.map((v) => v), color: "#e0a030" });

  return (
    <SectionCard title={`Sales by Month — ${year} vs ${year - 1}`}>
      <TrendLines series={series} />
      {totalPrevious <= 0 && <p className="mt-1 text-[12px] text-text-secondary">No {year - 1} figures are recorded, so only {year} is drawn.</p>}
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
