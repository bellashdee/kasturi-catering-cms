import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { getYearMonthlySeries } from "@/lib/reports/queries";
import { formatCurrency, malaysiaYearMonth } from "@/lib/format";
import { MONTH_LABEL } from "@/lib/finance/constants";
import { SectionCard, EmptyRow } from "@/components/dashboard/SectionCard";
import { SoftHeader, SoftPage } from "@/components/ui/Soft";
import { YearCompareBars } from "@/components/reports/YearCompareBars";
import { Select } from "@/components/ui/Select";
import { PrintButton } from "@/components/reports/PrintButton";

const FIRST_YEAR = 2024;

const sum = (values: number[], months = 12) => values.slice(0, months).reduce((t, v) => t + v, 0);

/** The change from one figure to the other: the amount, and the percentage (or "New" when there was nothing before). */
function change(now: number, before: number) {
  const diff = now - before;
  const pct = before > 0 ? `${diff >= 0 ? "+" : ""}${((diff / before) * 100).toFixed(1)}%` : now > 0 ? "New" : "—";
  return { diff, pct, tone: diff > 0 ? "text-success" : diff < 0 ? "text-danger" : "text-text-secondary" };
}

/**
 * Sales of one year against another (by default this year against last year), month by month and company by company.
 * Sales are the monthly sales keyed in; for a month with none keyed in, the payments received in that month.
 * To be fair, the totals compare the same months: this year so far against the same months of the other year.
 */
export default async function SalesComparisonPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; year?: string; compare?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { company: requestedId, year: yearParam, compare: compareParam } = await searchParams;
  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";
  if (targetCompanyIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;

  const now = malaysiaYearMonth();
  const year = Math.min(Math.max(Number(yearParam) || now.year, FIRST_YEAR), now.year);
  const compare = Math.min(Math.max(Number(compareParam) || year - 1, FIRST_YEAR - 1), now.year);
  // months of the chosen year that have happened (the whole year for a past year)
  const lastMonth = year < now.year ? 12 : now.month;
  const period = lastMonth === 12 ? "whole year" : `Jan – ${MONTH_LABEL[lastMonth - 1].slice(0, 3)}`;
  const years = Array.from({ length: now.year - FIRST_YEAR + 2 }, (_, i) => now.year - i);

  const shown = companies.filter((c) => targetCompanyIds.includes(c.id));
  const perCompany = await Promise.all(
    shown.map(async (c) => {
      const [cur, prev] = await Promise.all([getYearMonthlySeries(supabase, [c.id], year), getYearMonthlySeries(supabase, [c.id], compare)]);
      return { id: c.id, name: c.name, current: cur.revenue, previous: prev.revenue };
    }),
  );
  const current = Array.from({ length: 12 }, (_, m) => perCompany.reduce((t, c) => t + c.current[m], 0));
  const previous = Array.from({ length: 12 }, (_, m) => perCompany.reduce((t, c) => t + c.previous[m], 0));

  const curTotal = sum(current, lastMonth);
  const prevSamePeriod = sum(previous, lastMonth);
  const prevWholeYear = sum(previous);
  const total = change(curTotal, prevSamePeriod);
  const best = current.slice(0, lastMonth).reduce((b, v, i) => (v > current[b] ? i : b), 0);

  const card = "rounded-2xl border border-border bg-surface p-4 shadow-sm";
  return (
    <SoftPage>
      <SoftHeader title="Sales comparison" subtitle={`${compare} against ${year}, month by month. Figures come from the sales keyed in.`} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <form method="get" className="flex flex-wrap items-end gap-3">
          {requestedId && <input type="hidden" name="company" value={requestedId} />}
          <label className="text-[12px] font-semibold text-text-secondary">
            Year
            <Select name="year" defaultValue={String(year)} className="mt-1 block h-9 w-28 rounded-lg border border-border-strong px-2 text-[13px]">
              {years.filter((y) => y >= FIRST_YEAR).map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </label>
          <label className="text-[12px] font-semibold text-text-secondary">
            Compare with
            <Select name="compare" defaultValue={String(compare)} className="mt-1 block h-9 w-28 rounded-lg border border-border-strong px-2 text-[13px]">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </label>
          <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">Apply</button>
          {(yearParam || compareParam) && (
            <Link href={`/reports/sales-comparison${query}`} className="flex h-9 items-center rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-text">This year</Link>
          )}
        </form>
        <PrintButton />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={card}>
          <div className="text-[11.5px] font-bold uppercase tracking-wide text-text-muted">{`${year} (${period})`}</div>
          <div className="mt-1 text-[20px] font-extrabold tabular-nums text-text">{formatCurrency(curTotal)}</div>
        </div>
        <div className={card}>
          <div className="text-[11.5px] font-bold uppercase tracking-wide text-text-muted">{`${compare} (${period})`}</div>
          <div className="mt-1 text-[20px] font-extrabold tabular-nums text-text">{formatCurrency(prevSamePeriod)}</div>
          {lastMonth < 12 && <div className="mt-0.5 text-[12px] text-text-secondary">{`Whole ${compare}: ${formatCurrency(prevWholeYear)}`}</div>}
        </div>
        <div className={card}>
          <div className="text-[11.5px] font-bold uppercase tracking-wide text-text-muted">Change</div>
          <div className={`mt-1 text-[20px] font-extrabold tabular-nums ${total.tone}`}>{total.pct}</div>
          <div className={`mt-0.5 text-[12px] tabular-nums ${total.tone}`}>{`${total.diff >= 0 ? "+" : "−"}${formatCurrency(Math.abs(total.diff))}`}</div>
        </div>
        <div className={card}>
          <div className="text-[11.5px] font-bold uppercase tracking-wide text-text-muted">{`Best month of ${year}`}</div>
          <div className="mt-1 text-[20px] font-extrabold text-text">{curTotal > 0 ? MONTH_LABEL[best] : "—"}</div>
          {curTotal > 0 && <div className="mt-0.5 text-[12px] tabular-nums text-text-secondary">{formatCurrency(current[best])}</div>}
        </div>
      </div>

      <SectionCard title="Sales by month">
        <YearCompareBars previous={previous} current={current} previousLabel={String(compare)} currentLabel={String(year)} lastMonth={lastMonth} />
        {prevWholeYear <= 0 && <p className="mt-1 text-[12px] text-text-secondary">{`No sales are recorded for ${compare}${shown.length > 1 ? " in these companies" : ""}.`}</p>}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-wider text-text-secondary">
                <th className="py-2 pr-3 font-bold">Month</th>
                <th className="py-2 pr-3 text-right font-bold">{compare}</th>
                <th className="py-2 pr-3 text-right font-bold">{year}</th>
                <th className="py-2 pr-3 text-right font-bold">Difference</th>
                <th className="py-2 text-right font-bold">Change</th>
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
                    <td className={`whitespace-nowrap py-2 pr-3 text-right tabular-nums ${done ? ch.tone : "text-text-muted"}`}>{done ? `${ch.diff >= 0 ? "+" : "−"}${formatCurrency(Math.abs(ch.diff))}` : "—"}</td>
                    <td className={`whitespace-nowrap py-2 text-right font-semibold tabular-nums ${done ? ch.tone : "text-text-muted"}`}>{done ? ch.pct : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border-strong font-bold">
                <td className="py-2 pr-3 text-text">{`Total (${period})`}</td>
                <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-text">{formatCurrency(prevSamePeriod)}</td>
                <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-text">{formatCurrency(curTotal)}</td>
                <td className={`whitespace-nowrap py-2 pr-3 text-right tabular-nums ${total.tone}`}>{`${total.diff >= 0 ? "+" : "−"}${formatCurrency(Math.abs(total.diff))}`}</td>
                <td className={`whitespace-nowrap py-2 text-right tabular-nums ${total.tone}`}>{total.pct}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </SectionCard>

      {perCompany.length > 1 && (
        <SectionCard title={`By company (${period})`}>
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
                {perCompany.map((c) => {
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
        </SectionCard>
      )}
    </SoftPage>
  );
}
