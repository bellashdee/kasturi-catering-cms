import { PieChart, sumBy } from "@/components/reports/PieChart";
import { parseDateRange } from "@/lib/finance/constants";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { getSupplierPaymentReportRows } from "@/lib/reports/queries";
import { PAYMENT_STATUS_LABEL } from "@/lib/procurement/constants";
import { formatCurrency, malaysiaYearMonth } from "@/lib/format";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable } from "@/components/reports/ReportTable";
import { buildReportRows } from "@/lib/reports/buildRows";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";

function currentYearMonth() {
  return malaysiaYearMonth();
}

export default async function SupplierPaymentReportPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; year?: string; month?: string; from?: string; to?: string; department?: string; status?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, year: yearParam, month: monthParam, from: fromParam, to: toParam, department: departmentParam, status: statusParam } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const { year: nowYear, month: nowMonth } = currentYearMonth();
  const year = Number(yearParam) || nowYear;
  const month = Number(monthParam) || nowMonth;
  const range = parseDateRange(fromParam, toParam);

  const allRows = await getSupplierPaymentReportRows(supabase, targetCompanyIds, year, month, range);
  const departments = Array.from(new Set(allRows.map((r) => r.supplier_invoices?.department).filter((d): d is string => !!d))).sort();
  const rows = allRows.filter((r) => {
    if (departmentParam && r.supplier_invoices?.department !== departmentParam) return false;
    if (statusParam && r.status !== statusParam) return false;
    return true;
  });
  const total = rows.reduce((t, r) => t + Number(r.amount), 0);

  const { headers, tableRows } = buildReportRows(
    rows,
    [
      { key: "invoice", label: "Invoice #", exportValue: (r) => r.supplier_invoices?.invoice_number ?? "—" },
      { key: "supplier", label: "Supplier", exportValue: (r) => r.supplier_invoices?.suppliers?.name ?? "—" },
      { key: "department", label: "Department", exportValue: (r) => r.supplier_invoices?.department ?? "—" },
      { key: "company", label: "Company", exportValue: (r) => r.companies?.name ?? "—" },
      { key: "amount", label: "Amount", exportValue: (r) => Number(r.amount), display: (r) => formatCurrency(Number(r.amount)) },
      {
        key: "status",
        label: "Status",
        exportValue: (r) => PAYMENT_STATUS_LABEL[r.status] ?? r.status,
        display: (r) => <StatusBadge tone={r.status === "paid" ? "success" : r.status === "rejected" ? "danger" : "warning"}>{PAYMENT_STATUS_LABEL[r.status] ?? r.status}</StatusBadge>,
      },
    ],
    (r) => r.id,
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/reports${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Reports</Link>
        <h1 className="mt-2 text-[22px] font-extrabold text-text">Supplier Payment Report</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{rows.length} payment{rows.length === 1 ? "" : "s"} · {formatCurrency(total)} total</p>
      </div>

      <ReportFilterBar
        requestedCompanyId={requestedId}
        year={year}
        month={month}
        from={fromParam}
        to={toParam}
        department={departmentParam}
        departmentOptions={departments.map((d) => ({ value: d, label: d }))}
        status={statusParam}
        statusOptions={Object.entries(PAYMENT_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PieChart title="Payments by supplier" slices={sumBy(rows, (r) => r.supplier_invoices?.suppliers?.name ?? "—", (r) => Number(r.amount))} />
        <PieChart title="Payments by department" slices={sumBy(rows, (r) => r.supplier_invoices?.department ?? "—", (r) => Number(r.amount))} />
      </div>

      <ReportTable
        filenameBase={`supplier-payments-${year}-${month}`}
        headers={headers}
        rows={tableRows}
      />
    </div>
  );
}
