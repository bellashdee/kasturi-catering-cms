import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { getMarketingReportRows } from "@/lib/reports/queries";
import { CAMPAIGN_STATUS_LABEL, CAMPAIGN_CHANNEL_LABEL } from "@/lib/marketing/constants";
import { listExpensesForCompanies } from "@/lib/marketing/queries";
import { monthDateRange } from "@/lib/finance/constants";
import { formatCurrency } from "@/lib/format";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable } from "@/components/reports/ReportTable";
import { buildReportRows } from "@/lib/reports/buildRows";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";

function currentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export default async function MarketingReportPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; year?: string; month?: string; category?: string; status?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, year: yearParam, month: monthParam, category: categoryParam, status: statusParam } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const { year: nowYear, month: nowMonth } = currentYearMonth();
  const year = Number(yearParam) || nowYear;
  const month = Number(monthParam) || nowMonth;
  const { start, end } = monthDateRange(year, month);

  const [allCampaigns, allExpenses] = await Promise.all([
    getMarketingReportRows(supabase, targetCompanyIds, year, month),
    listExpensesForCompanies(supabase, targetCompanyIds),
  ]);

  const rows = allCampaigns.filter((c) => {
    if (categoryParam && c.channel !== categoryParam) return false;
    if (statusParam && c.status !== statusParam) return false;
    return true;
  });

  const monthSpend = allExpenses.filter((e) => e.expense_date >= start && e.expense_date <= end).reduce((t, e) => t + Number(e.amount), 0);

  const { headers, tableRows } = buildReportRows(
    rows,
    [
      { key: "campaign", label: "Campaign", exportValue: (r) => r.name },
      { key: "channel", label: "Channel", exportValue: (r) => CAMPAIGN_CHANNEL_LABEL[r.channel] ?? r.channel },
      { key: "start", label: "Start", exportValue: (r) => r.start_date ?? "—" },
      { key: "end", label: "End", exportValue: (r) => r.end_date ?? "—" },
      { key: "budget", label: "Budget", exportValue: (r) => Number(r.budget ?? 0), display: (r) => formatCurrency(Number(r.budget ?? 0)) },
      { key: "company", label: "Company", exportValue: (r) => r.companies?.name ?? "—" },
      {
        key: "status",
        label: "Status",
        exportValue: (r) => CAMPAIGN_STATUS_LABEL[r.status] ?? r.status,
        display: (r) => <StatusBadge tone={r.status === "active" ? "success" : r.status === "cancelled" ? "danger" : "neutral"}>{CAMPAIGN_STATUS_LABEL[r.status] ?? r.status}</StatusBadge>,
      },
    ],
    (r) => r.id,
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/reports${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Reports</Link>
        <h1 className="mt-2 text-[22px] font-extrabold text-text">Marketing Report</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{rows.length} campaign{rows.length === 1 ? "" : "s"} started this month</p>
      </div>

      <ReportFilterBar
        requestedCompanyId={requestedId}
        year={year}
        month={month}
        category={categoryParam}
        categoryOptions={Object.entries(CAMPAIGN_CHANNEL_LABEL).map(([value, label]) => ({ value, label }))}
        categoryLabel="Channel"
        status={statusParam}
        statusOptions={Object.entries(CAMPAIGN_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
      />

      <SectionCard title="Marketing Spend This Month">
        <div className="text-xl font-extrabold text-text">{formatCurrency(monthSpend)}</div>
      </SectionCard>

      <ReportTable
        filenameBase={`marketing-${year}-${month}`}
        headers={headers}
        rows={tableRows}
      />
    </div>
  );
}
