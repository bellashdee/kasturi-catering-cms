import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listCustomerInvoices } from "@/lib/finance/queries";
import { INVOICE_STATUS_LABEL, isOverdue } from "@/lib/finance/constants";
import { formatCurrency } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow, SectionCard, StatRow } from "@/components/dashboard/SectionCard";
import { FinanceSubNav } from "@/components/finance/FinanceSubNav";

function statusTone(status: string, overdue: boolean): "success" | "warning" | "danger" {
  if (status === "paid") return "success";
  if (overdue) return "danger";
  return "warning";
}

export default async function CustomerInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const invoices = await listCustomerInvoices(supabase, targetCompanyIds);
  const outstanding = invoices.filter((i) => i.status !== "paid");
  const totalOutstanding = outstanding.reduce((t, i) => t + Number(i.amount), 0);
  const overdueCount = outstanding.filter((i) => isOverdue(i.due_date, i.status)).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Finance & Admin</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{invoices.length} customer invoice{invoices.length === 1 ? "" : "s"}</p>
        </div>
        <Link href={`/finance-admin/invoices/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Invoice
        </Link>
      </div>

      <FinanceSubNav />

      <SectionCard title="Customer Outstanding">
        <StatRow label="Total outstanding" value={formatCurrency(totalOutstanding)} />
        <StatRow label="Overdue invoices" value={overdueCount} />
      </SectionCard>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {invoices.length === 0 ? (
          <EmptyRow text="No customer invoices yet." />
        ) : (
          <div>
            <div className="grid grid-cols-[1.2fr_1.2fr_1fr_1fr_1fr_1fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Invoice #</div>
              <div>Customer</div>
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
                  href={`/finance-admin/invoices/${inv.id}${query}`}
                  className="grid grid-cols-[1.2fr_1.2fr_1fr_1fr_1fr_1fr] border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0 hover:bg-surface-alt"
                >
                  <div className="font-semibold text-text">{inv.invoice_number}</div>
                  <div className="text-text-secondary">{inv.customers?.name ?? "—"}</div>
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
