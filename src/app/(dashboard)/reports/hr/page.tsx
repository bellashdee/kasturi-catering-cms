import { parseDateRange } from "@/lib/finance/constants";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { getHRReportRows } from "@/lib/reports/queries";
import { canUsePayrollCentre } from "@/lib/hr/payrollAccess";
import { PAYROLL_STATUS_LABEL } from "@/lib/hr/constants";
import { formatCurrency, malaysiaYearMonth } from "@/lib/format";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable } from "@/components/reports/ReportTable";
import { buildReportRows } from "@/lib/reports/buildRows";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow, SectionCard } from "@/components/dashboard/SectionCard";
import { DonutChart } from "@/components/reports/Charts";
import { readSort, sortBy } from "@/lib/listSort";

const SORTS = { period: "Pay Period", employee: "Employee", department: "Department", net: "Net Pay", status: "Status" };

function currentYearMonth() {
  return malaysiaYearMonth();
}

export default async function HRReportPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; year?: string; month?: string; from?: string; to?: string; department?: string; status?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  // payroll is private: only the Director of Finance and her personal assistant
  if (!(await canUsePayrollCentre(supabase))) return <EmptyRow text="Payroll is private. Only the Director of Finance and her personal assistant can open this report." />;
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { company: requestedId, year: yearParam, month: monthParam, from: fromParam, to: toParam, department: departmentParam, status: statusParam } = sp;
  const { sort, dir } = readSort(sp, SORTS, "period", "desc");
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const { year: nowYear, month: nowMonth } = currentYearMonth();
  const year = Number(yearParam) || nowYear;
  const month = Number(monthParam) || nowMonth;
  const range = parseDateRange(fromParam, toParam);

  const [allRows, headcountRes] = await Promise.all([
    getHRReportRows(supabase, targetCompanyIds, year, month, range),
    supabase.from("employees").select("id", { count: "exact", head: true }).in("company_id", targetCompanyIds).eq("status", "active"),
  ]);

  const departments = Array.from(new Set(allRows.map((r) => r.employees?.department).filter((d): d is string => !!d))).sort();
  const filtered = allRows.filter((r) => {
    if (departmentParam && r.employees?.department !== departmentParam) return false;
    if (statusParam && r.status !== statusParam) return false;
    return true;
  });
  const rows = sortBy(filtered, sort, dir, {
    period: [(r) => r.pay_period_end, (r) => r.employees?.full_name],
    employee: [(r) => r.employees?.full_name, (r) => r.pay_period_end],
    department: [(r) => r.employees?.department, (r) => r.employees?.full_name],
    net: (r) => Number(r.net_pay),
    status: [(r) => PAYROLL_STATUS_LABEL[r.status] ?? r.status, (r) => r.employees?.full_name],
  });
  const totalGross = rows.reduce((t, r) => t + Number(r.gross_pay), 0);
  const totalNet = rows.reduce((t, r) => t + Number(r.net_pay), 0);
  const grossByDepartment = new Map<string, number>();
  for (const r of rows) {
    const department = r.employees?.department ?? "No department";
    grossByDepartment.set(department, (grossByDepartment.get(department) ?? 0) + Number(r.gross_pay));
  }
  const byDepartment = Array.from(grossByDepartment.entries()).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));

  const { headers, tableRows } = buildReportRows(
    rows,
    [
      { key: "employee", label: "Employee", exportValue: (r) => r.employees?.full_name ?? "—" },
      { key: "department", label: "Department", exportValue: (r) => r.employees?.department ?? "—" },
      { key: "period", label: "Pay Period", exportValue: (r) => `${r.pay_period_start} – ${r.pay_period_end}` },
      { key: "gross", label: "Gross Pay", exportValue: (r) => Number(r.gross_pay), display: (r) => formatCurrency(Number(r.gross_pay)) },
      { key: "net", label: "Net Pay", exportValue: (r) => Number(r.net_pay), display: (r) => formatCurrency(Number(r.net_pay)) },
      { key: "company", label: "Company", exportValue: (r) => r.companies?.name ?? "—" },
      {
        key: "status",
        label: "Status",
        exportValue: (r) => PAYROLL_STATUS_LABEL[r.status] ?? r.status,
        display: (r) => <StatusBadge tone={r.status === "paid" ? "success" : "warning"}>{PAYROLL_STATUS_LABEL[r.status] ?? r.status}</StatusBadge>,
      },
    ],
    (r) => r.id,
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/reports${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Reports</Link>
        <h1 className="mt-2 text-[22px] font-extrabold text-text">HR Report</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{rows.length} payroll record{rows.length === 1 ? "" : "s"}</p>
      </div>

      <ReportFilterBar
        path="/reports/hr"
        sortOptions={SORTS}
        sort={sort}
        dir={dir}
        requestedCompanyId={requestedId}
        year={year}
        month={month}
        from={fromParam}
        to={toParam}
        department={departmentParam}
        departmentOptions={departments.map((d) => ({ value: d, label: d }))}
        status={statusParam}
        statusOptions={Object.entries(PAYROLL_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
      />

      <div className="grid grid-cols-3 gap-4">
        <SectionCard title="Active Staff"><div className="text-xl font-extrabold text-text">{headcountRes.count ?? 0}</div></SectionCard>
        <SectionCard title="Gross Pay"><div className="text-xl font-extrabold text-text">{formatCurrency(totalGross)}</div></SectionCard>
        <SectionCard title="Net Pay"><div className="text-xl font-extrabold text-text">{formatCurrency(totalNet)}</div></SectionCard>
      </div>

      <SectionCard title="Gross Pay by Department">
        <DonutChart slices={byDepartment} centerLabel="Gross pay" empty="No payroll records for this period." />
      </SectionCard>

      <ReportTable
        filenameBase={`hr-${year}-${month}`}
        headers={headers}
        rows={tableRows}
      />
    </div>
  );
}
