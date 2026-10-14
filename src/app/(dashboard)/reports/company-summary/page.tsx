import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { getCompanySummary } from "@/lib/reports/queries";
import { formatCurrency, malaysiaYearMonth } from "@/lib/format";
import { MONTH_LABEL, parseDateRange } from "@/lib/finance/constants";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { PrintButton } from "@/components/reports/PrintButton";
import { SectionCard, EmptyRow, StatRow } from "@/components/dashboard/SectionCard";

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

  const summary = await getCompanySummary(supabase, targetCompanyIds, year, month, range);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/reports${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Reports</Link>
        <h1 className="mt-2 text-[22px] font-extrabold text-text">Company Summary — {viewLabel}</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{MONTH_LABEL[month - 1]} {year}</p>
      </div>

      <div className="flex items-center justify-between print:hidden">
        <ReportFilterBar requestedCompanyId={requestedId} year={year} month={month}
        from={fromParam}
        to={toParam} />
        <PrintButton />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Revenue</div>
          <div className="mt-1 text-xl font-extrabold text-text">{formatCurrency(summary.revenue)}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Total Cost</div>
          <div className="mt-1 text-xl font-extrabold text-text">{formatCurrency(summary.totalCost)}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Net</div>
          <div className={`mt-1 text-xl font-extrabold ${summary.net >= 0 ? "text-success" : "text-danger"}`}>{formatCurrency(summary.net)}</div>
        </div>
      </div>

      <SectionCard title="Cost by Module">
        {summary.bySource.length === 0 ? (
          <EmptyRow text="No costs recorded this month." />
        ) : (
          summary.bySource.map((s) => <StatRow key={s.source} label={s.source} value={formatCurrency(s.amount)} />)
        )}
      </SectionCard>

      <div className="grid grid-cols-2 gap-5">
        <SectionCard title="Operations">
          <StatRow label="Active staff" value={summary.activeStaff} />
          <StatRow label="Active marketing campaigns" value={summary.activeCampaigns} />
          <StatRow label="Kitchen production orders this month" value={summary.productionOrders} />
          <StatRow label="Deliveries this month" value={summary.deliveries} />
        </SectionCard>

        <SectionCard title="Outstanding">
          <StatRow label="Supplier outstanding" value={formatCurrency(summary.supplierOutstanding)} />
          <StatRow label="Customer outstanding" value={formatCurrency(summary.customerOutstanding)} />
        </SectionCard>
      </div>
    </div>
  );
}
