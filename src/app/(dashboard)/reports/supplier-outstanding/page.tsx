import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listSupplierInvoices } from "@/lib/procurement/queries";
import { INVOICE_STATUS_LABEL, isOverdue } from "@/lib/procurement/constants";
import { formatCurrency } from "@/lib/format";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable } from "@/components/reports/ReportTable";
import { buildReportRows } from "@/lib/reports/buildRows";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";

export default async function SupplierOutstandingReportPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; department?: string; status?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, department: departmentParam, status: statusParam } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const allInvoices = await listSupplierInvoices(supabase, targetCompanyIds);
  const outstanding = allInvoices.filter((i) => i.status !== "paid");
  const departments = Array.from(new Set(outstanding.map((i) => i.department).filter((d): d is string => !!d))).sort();
  const rows = outstanding.filter((i) => {
    if (departmentParam && i.department !== departmentParam) return false;
    if (statusParam && i.status !== statusParam) return false;
    return true;
  });
  const total = rows.reduce((t, i) => t + Number(i.amount), 0);

  const { headers, tableRows } = buildReportRows(
    rows,
    [
      { key: "invoice", label: "Invoice #", exportValue: (r) => r.invoice_number },
      { key: "supplier", label: "Supplier", exportValue: (r) => r.suppliers?.name ?? "—" },
      { key: "due", label: "Due Date", exportValue: (r) => r.due_date },
      { key: "department", label: "Department", exportValue: (r) => r.department ?? "—" },
      { key: "company", label: "Company", exportValue: (r) => r.companies?.name ?? "—" },
      { key: "amount", label: "Amount", exportValue: (r) => Number(r.amount), display: (r) => formatCurrency(Number(r.amount)) },
      {
        key: "status",
        label: "Status",
        exportValue: (r) => INVOICE_STATUS_LABEL[r.status] ?? r.status,
        display: (r) => <StatusBadge tone={isOverdue(r.due_date, r.status) ? "danger" : "warning"}>{INVOICE_STATUS_LABEL[r.status] ?? r.status}</StatusBadge>,
      },
    ],
    (r) => r.id,
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/reports${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Reports</Link>
        <h1 className="mt-2 text-[22px] font-extrabold text-text">Supplier Outstanding Report</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{rows.length} invoice{rows.length === 1 ? "" : "s"} · {formatCurrency(total)} outstanding</p>
      </div>

      <ReportFilterBar
        requestedCompanyId={requestedId}
        showYear={false}
        showMonth={false}
        department={departmentParam}
        departmentOptions={departments.map((d) => ({ value: d, label: d }))}
        status={statusParam}
        statusOptions={Object.entries(INVOICE_STATUS_LABEL).filter(([v]) => v !== "paid").map(([value, label]) => ({ value, label }))}
      />

      <ReportTable
        filenameBase="supplier-outstanding"
        headers={headers}
        rows={tableRows}
      />
    </div>
  );
}
