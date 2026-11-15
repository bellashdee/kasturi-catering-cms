import { formatCurrency } from "@/lib/format";
import { MONTH_LABEL } from "@/lib/finance/constants";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { YearCompareBars } from "@/components/reports/YearCompareBars";

const sum = (values: number[], months = 12) => values.slice(0, months).reduce((t, v) => t + v, 0);

/** The change from one figure to the other: the amount, and the percentage (or "New" when there was nothing before). */
function change(now: number, before: number) {
  const diff = now - before;
  const pct = before > 0 ? `${diff >= 0 ? "+" : ""}${((diff / before) * 100).toFixed(1)}%` : now > 0 ? "New" : "—";
  return { diff, pct, tone: diff > 0 ? "text-success" : diff < 0 ? "text-danger" : "text-text-secondary" };
}
const signed = (diff: number) => `${diff >= 0 ? "+" : "−"}${formatCurrency(Math.abs(diff))}`;

export type CompanySales = { id: string; name: string; current: number[]; previous: number[] };

/**
 * Sales of a year against the year before: the totals of the same months (this year so far against the same months of last year, so the
 * comparison is fair), the change, the best month, the bars and the table month by month (with the purchases of the year beside the sales),
 * and each company.
 */
export function SalesYearComparison({
  year,
  compare,
  lastMonth,
  current,
  previous,
  purchases,
  companies,
}: {
  year: number;
  compare: number;
  /** months of `year` that have come (12 for a past year) */
  lastMonth: number;
  current: number[];
  previous: number[];
  purchases: number[];
  companies: CompanySales[];
}) {
  const period = lastMonth === 12 ? "whole year" : lastMonth > 0 ? `Jan – ${MONTH_LABEL[lastMonth - 1].slice(0, 3)}` : "no month yet";
  const curTotal = sum(current, lastMonth);
  const prevSamePeriod = sum(previous, lastMonth);
  const prevWholeYear = sum(previous);
  const purchaseTotal = sum(purchases, lastMonth);
  const total = change(curTotal, prevSamePeriod);
  const best = current.slice(0, lastMonth).reduce((b, v, i) => (v > current[b] ? i : b), 0);
  const hasPurchases = purchases.some((v) => v > 0);

  const card = "rounded-xl border border-border bg-surface-alt/50 p-3.5";
  const label = "text-[11px] font-bold uppercase tracking-wide text-text-muted";
  return (
    <SectionCard title={`Sales: ${year} vs ${compare}`}>
      <p className="mb-3 text-[12px] text-text-secondary">
        {`Sales of each month against the same month of ${compare}: the monthly sales keyed in, or the invoices issued in a month with none keyed. The totals compare the same months (${period}).`}
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className={card}>
          <div className={label}>{`${year} (${period})`}</div>
          <div className="mt-1 text-[18px] font-extrabold tabular-nums text-text">{formatCurrency(curTotal)}</div>
        </div>
        <div className={card}>
          <div className={label}>{`${compare} (${period})`}</div>
          <div className="mt-1 text-[18px] font-extrabold tabular-nums text-text">{formatCurrency(prevSamePeriod)}</div>
          {lastMonth < 12 && <div className="mt-0.5 text-[12px] text-text-secondary">{`Whole ${compare}: ${formatCurrency(prevWholeYear)}`}</div>}
        </div>
        <div className={card}>
          <div className={label}>Change</div>
          <div className={`mt-1 text-[18px] font-extrabold tabular-nums ${total.tone}`}>{total.pct}</div>
          <div className={`mt-0.5 text-[12px] tabular-nums ${total.tone}`}>{signed(total.diff)}</div>
        </div>
        <div className={card}>
          <div className={label}>{`Best month of ${year}`}</div>
          <div className="mt-1 text-[18px] font-extrabold text-text">{curTotal > 0 ? MONTH_LABEL[best] : "—"}</div>
          {curTotal > 0 && <div className="mt-0.5 text-[12px] tabular-nums text-text-secondary">{formatCurrency(current[best])}</div>}
        </div>
      </div>

      {/* the bars keep a readable size on a phone: the chart scrolls sideways instead of shrinking */}
      <div className="mt-5 overflow-x-auto">
        <div className="min-w-[560px]">
          <YearCompareBars previous={previous} current={current} previousLabel={String(compare)} currentLabel={String(year)} lastMonth={lastMonth} />
        </div>
      </div>
      {prevWholeYear <= 0 && <p className="mt-1 text-[12px] text-text-secondary">{`No sales are recorded for ${compare}${companies.length > 1 ? " in these companies" : ""}.`}</p>}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-wider text-text-secondary">
              <th className="py-2 pr-3 font-bold">Month</th>
              <th className="py-2 pr-3 text-right font-bold">{compare}</th>
              <th className="py-2 pr-3 text-right font-bold">{year}</th>
              <th className="py-2 pr-3 text-right font-bold">Difference</th>
              <th className="py-2 pr-3 text-right font-bold">Change</th>
              {hasPurchases && <th className="py-2 text-right font-bold">{`Purchases ${year}`}</th>}
            </tr>
          </thead>
          <tbody>
            {MONTH_LABEL.map((m, i) => {
              const done = i < lastMonth;
              const ch = change(current[i], previous[i]);
              return (
                <tr key={m} className="border-b border-border last:border-b-0">
                  <td className="py-2 pr-3 font-semibold text-text">{m}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-text-secondary">{previous[i] > 0 ? formatCurrency(previous[i]) : "—"}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-text">{done ? formatCurrency(current[i]) : "—"}</td>
                  <td className={`whitespace-nowrap py-2 pr-3 text-right tabular-nums ${done ? ch.tone : "text-text-muted"}`}>{done ? signed(ch.diff) : "—"}</td>
                  <td className={`whitespace-nowrap py-2 pr-3 text-right font-semibold tabular-nums ${done ? ch.tone : "text-text-muted"}`}>{done ? ch.pct : "—"}</td>
                  {hasPurchases && <td className="whitespace-nowrap py-2 text-right tabular-nums text-text-secondary">{purchases[i] > 0 ? formatCurrency(purchases[i]) : "—"}</td>}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border-strong font-bold">
              <td className="py-2 pr-3 text-text">{`Total (${period})`}</td>
              <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-text">{formatCurrency(prevSamePeriod)}</td>
              <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-text">{formatCurrency(curTotal)}</td>
              <td className={`whitespace-nowrap py-2 pr-3 text-right tabular-nums ${total.tone}`}>{signed(total.diff)}</td>
              <td className={`whitespace-nowrap py-2 pr-3 text-right tabular-nums ${total.tone}`}>{total.pct}</td>
              {hasPurchases && <td className="whitespace-nowrap py-2 text-right tabular-nums text-text">{formatCurrency(purchaseTotal)}</td>}
            </tr>
          </tfoot>
        </table>
      </div>
      {hasPurchases && curTotal > 0 && (
        <p className="mt-2 text-[12px] text-text-secondary">{`Purchases ${year} (${period}): ${((purchaseTotal / curTotal) * 100).toFixed(1)}% of sales.`}</p>
      )}

      {companies.length > 1 && (
        <>
          <div className="mb-1 mt-6 text-[12px] font-bold uppercase tracking-wider text-text-secondary">{`By company (${period})`}</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-wider text-text-secondary">
                  <th className="py-2 pr-3 font-bold">Company</th>
                  <th className="py-2 pr-3 text-right font-bold">{compare}</th>
                  <th className="py-2 pr-3 text-right font-bold">{year}</th>
                  <th className="py-2 text-right font-bold">Change</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => {
                  const a = sum(c.previous, lastMonth);
                  const b = sum(c.current, lastMonth);
                  const ch = change(b, a);
                  return (
                    <tr key={c.id} className="border-b border-border last:border-b-0">
                      <td className="py-2 pr-3 font-semibold text-text">{c.name}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-text-secondary">{a > 0 ? formatCurrency(a) : "No data"}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-text">{formatCurrency(b)}</td>
                      <td className={`whitespace-nowrap py-2 text-right font-semibold tabular-nums ${ch.tone}`}>{ch.pct}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </SectionCard>
  );
}
