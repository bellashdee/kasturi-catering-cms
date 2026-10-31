import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listCustomerInvoices } from "@/lib/finance/queries";
import { INVOICE_STATUS_LABEL, isOverdue } from "@/lib/finance/constants";
import { invoiceBalance, invoicePaid, invoiceTotal, isOpenInvoice } from "@/lib/finance/outstanding";
import { formatCurrency } from "@/lib/format";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable } from "@/components/reports/ReportTable";
import { buildReportRows } from "@/lib/reports/buildRows";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";

export default async function CustomerOutstandingReportPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; status?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, status: statusParam } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const allInvoices = await listCustomerInvoices(supabase, targetCompanyIds);
  // the same balance the Performance Dashboard and the Company Summary use: invoice total with tax, less the payments received
  const outstanding = allInvoices.filter((i) => isOpenInvoice(i.status) && invoiceBalance(i) > 0);
  const rows = statusParam ? outstanding.filter((i) => i.status === statusParam) : outstanding;
  const total = rows.reduce((t, i) => t + invoiceBalance(i), 0);

  const { headers, tableRows } = buildReportRows(
    rows,
    [
      { key: "invoice", label: "Invoice #", exportValue: (r) => r.invoice_number },
      { key: "customer", label: "Customer", exportValue: (r) => r.customers?.name ?? "—" },
      { key: "due", label: "Due Date", exportValue: (r) => r.due_date },
      { key: "company", label: "Company", exportValue: (r) => r.companies?.name ?? "—" },
      { key: "amount", label: "Invoice Total", exportValue: (r) => invoiceTotal(r), display: (r) => formatCurrency(invoiceTotal(r)) },
      { key: "paid", label: "Paid", exportValue: (r) => invoicePaid(r), display: (r) => formatCurrency(invoicePaid(r)) },
      { key: "balance", label: "Balance Owed", exportValue: (r) => invoiceBalance(r), display: (r) => <span className="font-semibold text-text">{formatCurrency(invoiceBalance(r))}</span> },
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
        <h1 className="mt-2 text-[22px] font-extrabold text-text">Customer Outstanding Report</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{rows.length} invoice{rows.length === 1 ? "" : "s"} · {formatCurrency(total)} outstanding</p>
      </div>

      <ReportFilterBar
        requestedCompanyId={requestedId}
        showYear={false}
        showMonth={false}
        status={statusParam}
        statusOptions={Object.entries(INVOICE_STATUS_LABEL).filter(([v]) => isOpenInvoice(v)).map(([value, label]) => ({ value, label }))}
      />

      <ReportTable
        filenameBase="customer-outstanding"
        headers={headers}
        rows={tableRows}
      />
    </div>
  );
}
