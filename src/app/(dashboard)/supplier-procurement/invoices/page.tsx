import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listSupplierInvoices } from "@/lib/procurement/queries";
import { INVOICE_STATUS_LABEL, isOverdue } from "@/lib/procurement/constants";
import { formatCurrency } from "@/lib/format";
import { parseInvoiceDateFilter } from "@/lib/finance/dateFilter";
import { InvoiceDateFilter } from "@/components/shared/InvoiceDateFilter";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { SupplierProcurementSubNav } from "@/components/procurement/SupplierProcurementSubNav";

function statusTone(status: string, overdue: boolean): "success" | "warning" | "danger" | "neutral" {
  if (status === "paid") return "success";
  if (overdue) return "danger";
  if (status === "disputed") return "danger";
  return "warning";
}

export default async function SupplierInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; dateField?: string; from?: string; to?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, dateField, from, to } = await searchParams;
  const dateFilter = parseInvoiceDateFilter({ dateField, from, to });
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const invoices = await listSupplierInvoices(supabase, targetCompanyIds, dateFilter);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Supplier & Procurement</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{invoices.length} invoice{invoices.length === 1 ? "" : "s"}{dateFilter.active ? ` · ${dateFilter.field === "due_date" ? "due" : "dated"} ${dateFilter.from ?? "any date"} to ${dateFilter.to ?? "any date"}` : ""}</p>
        </div>
        <Link href={`/supplier-procurement/invoices/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Invoice
        </Link>
      </div>

      <SupplierProcurementSubNav />

      <InvoiceDateFilter filter={dateFilter} requestedCompanyId={requestedId} clearHref={`/supplier-procurement/invoices${query}`} />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {invoices.length === 0 ? (
          <EmptyRow text={dateFilter.active ? "No invoices match this date filter." : "No invoices yet."} />
        ) : (
          <div>
            <div className="grid grid-cols-[1.2fr_1.2fr_1fr_1fr_1fr_1fr_1fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Invoice #</div>
              <div>Supplier</div>
              <div>Invoice Date</div>
              <div>Due Date</div>
              <div>Amount</div>
              <div>Company</div>
              <div>Status</div>
            </div>
            {invoices.map((inv) => {
              const overdue = isOverdue(inv.due_date, inv.status);
              return (
                <Link
                  key={inv.id}
                  href={`/supplier-procurement/invoices/${inv.id}${query}`}
                  className="grid grid-cols-[1.2fr_1.2fr_1fr_1fr_1fr_1fr_1fr] border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0 hover:bg-surface-alt"
                >
                  <div className="font-semibold text-text">{inv.invoice_number}</div>
                  <div className="text-text-secondary">{inv.suppliers?.name}</div>
                  <div className="text-text-secondary">{inv.invoice_date}</div>
                  <div className="text-text-secondary">{inv.due_date}</div>
                  <div className="text-text-secondary">{formatCurrency(Number(inv.amount))}</div>
                  <div className="text-text-secondary">{inv.companies?.name}</div>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge tone={statusTone(inv.status, overdue)}>{INVOICE_STATUS_LABEL[inv.status] ?? inv.status}</StatusBadge>
                    {overdue && <StatusBadge tone="danger">Overdue</StatusBadge>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
