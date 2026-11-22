import { PieChart } from "@/components/reports/PieChart";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { getCompanySummary, getYearMonthlySeries } from "@/lib/reports/queries";
import { formatCurrency, malaysiaYearMonth } from "@/lib/format";
import { MONTH_LABEL, parseDateRange } from "@/lib/finance/constants";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { PrintButton } from "@/components/reports/PrintButton";
import { SectionCard, EmptyRow, StatRow } from "@/components/dashboard/SectionCard";
import { SummaryInfographic } from "@/components/reports/SummaryInfographic";
import { SalesByMonthComparison } from "@/components/reports/SalesByMonthComparison";
import { SoftPage } from "@/components/ui/Soft";
import { isRestaurantScope } from "@/lib/restaurantView";

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

      <SectionCard title="Cost by Module">
        {summary.bySource.length === 0 ? (
          <EmptyRow text="No costs recorded this month." />
        ) : (
          summary.bySource.map((s) => <StatRow key={s.source} label={s.source} value={formatCurrency(s.amount)} />)
        )}
      </SectionCard>
    </SoftPage>
  );
}
