import { PieChart } from "@/components/reports/PieChart";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { getCompanySummary, getYearMonthlySeries } from "@/lib/reports/queries";
import { malaysiaYearMonth } from "@/lib/format";
import { MONTH_LABEL, parseDateRange } from "@/lib/finance/constants";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { PrintButton } from "@/components/reports/PrintButton";
import { SectionCard, EmptyRow, StatRow } from "@/components/dashboard/SectionCard";
import { SummaryInfographic } from "@/components/reports/SummaryInfographic";
import { SalesByMonthComparison } from "@/components/reports/SalesByMonthComparison";
import { SoftPage } from "@/components/ui/Soft";
import { isRestaurantScope } from "@/lib/restaurantView";
import { TotalOrigin } from "@/components/shared/TotalOrigin";
import { costPart, salesParts } from "@/lib/origin/parts";

function currentYearMonth() {
  return malaysiaYearMonth();
}

export default async function CompanySummaryReportPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; year?: string; month?: string; from?: string; to?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, year: yearParam, month: monthParam, from: fromParam, to: toParam } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const { year: nowYear, month: nowMonth } = currentYearMonth();
  const year = Number(yearParam) || nowYear;
  const month = Number(monthParam) || nowMonth;
  const range = parseDateRange(fromParam, toParam);

  const selectedCompany = companies.find((c) => targetCompanyIds.length === 1 && c.id === targetCompanyIds[0]);
  const viewLabel = selectedCompany ? selectedCompany.name : "All Companies";

  const [summary, series, prevSeries] = await Promise.all([
    getCompanySummary(supabase, targetCompanyIds, year, month, range),
    getYearMonthlySeries(supabase, targetCompanyIds, year),
    getYearMonthlySeries(supabase, targetCompanyIds, year - 1),
  ]);
  const periodLabel = range ? `${range.start} – ${range.end}` : `${MONTH_LABEL[month - 1]} ${year}`;
  // the records behind the figures: tapping a figure below lists them, tapping one opens its bill
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const costParts = summary.costRows.map((r) => costPart(r, companyName.get(r.companyId)));
  const revenueParts = range ? [] : await salesParts(supabase, targetCompanyIds, year, month, companyName);

  return (
    <SoftPage>
      <div>
        <Link href={`/reports${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Reports</Link>
        <h1 className="mt-2 text-[22px] font-extrabold text-text">Company Summary — {viewLabel}</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{periodLabel}</p>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <ReportFilterBar path="/reports/company-summary" requestedCompanyId={requestedId} year={year} month={month} from={fromParam} to={toParam} />
        <PrintButton />
      </div>

      <SummaryInfographic
        periodLabel={periodLabel}
        year={year}
        month={month}
        revenueByMonth={series.revenue}
        costByMonth={series.cost}
        revenue={summary.revenue}
        received={summary.received}
        totalCost={summary.totalCost}
        net={summary.net}
        bySource={summary.bySource}
        activeStaff={summary.activeStaff}
        activeCampaigns={summary.activeCampaigns}
        productionOrders={summary.productionOrders}
        deliveries={summary.deliveries}
        supplierOutstanding={summary.supplierOutstanding}
        customerOutstanding={summary.customerOutstanding}
        restaurant={isRestaurantScope(companies, targetCompanyIds)}
      />

      <SalesByMonthComparison year={year} current={series.revenue} previous={prevSeries.revenue} />

      <PieChart title="Cost by module" slices={summary.bySource.map((x) => ({ label: x.source, value: x.amount }))} />

      <SectionCard title="Where do these figures come from?">
        <p className="mb-1 text-[12.5px] text-text-muted">Tap a figure to see the records it adds up; tap a record&apos;s amount to open its bill.</p>
        <StatRow
          label="Revenue"
          value={<TotalOrigin total={summary.revenue} parts={revenueParts} title={`Revenue · ${periodLabel}`} explain={range ? "For a day range, the payments received from customers in those days." : "For each company, the monthly sales keyed in from AutoCount (Admin & Finance → Monthly Sales); a company with none keyed in for the month counts the invoices it issued, before tax."} />}
        />
        <StatRow label="Total cost" value={<TotalOrigin total={summary.totalCost} parts={costParts} title={`Total cost · ${periodLabel}`} explain="Every cost of the period from every module (the same list as Monthly Costing)." />} />
        <StatRow
          label="Net (revenue − cost)"
          value={<TotalOrigin total={summary.net} parts={[...revenueParts, ...costParts.map((p) => ({ ...p, amount: -p.amount }))]} title={`Net · ${periodLabel}`} explain="Revenue − total cost. The costs are listed as minus." />}
        />
      </SectionCard>

      <SectionCard title="Cost by Module">
        {summary.bySource.length === 0 ? (
          <EmptyRow text="No costs recorded this month." />
        ) : (
          summary.bySource.map((s) => <StatRow key={s.source} label={s.source} value={<TotalOrigin total={s.amount} parts={costParts.filter((p) => p.group === s.source)} title={`${s.source} · ${periodLabel}`} />} />)
        )}
      </SectionCard>
    </SoftPage>
  );
}
