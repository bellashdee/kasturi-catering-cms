import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listSupplierPayments } from "@/lib/procurement/queries";
import { getSupplierPayments } from "@/lib/queries/dashboard";
import { PAYMENT_STATUS_LABEL } from "@/lib/procurement/constants";
import { formatCurrency } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { SupplierProcurementSubNav } from "@/components/procurement/SupplierProcurementSubNav";
import { SupplierPaymentActions } from "@/components/procurement/SupplierPaymentActions";
import { PaymentExecutionForm } from "@/components/procurement/PaymentExecutionForm";

export default async function SupplierPaymentsPage({
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

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const [payments, kpis] = await Promise.all([
    listSupplierPayments(supabase, targetCompanyIds),
    getSupplierPayments(supabase, targetCompanyIds),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Supplier & Procurement</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Payment Dashboard</p>
      </div>

      <SupplierProcurementSubNav />

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Total Outstanding</div>
          <div className="mt-1 text-xl font-extrabold text-text">{formatCurrency(kpis.outstanding)}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-danger">Overdue</div>
          <div className="mt-1 text-xl font-extrabold text-danger">{kpis.overdueCount}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-warning">Due Today</div>
          <div className="mt-1 text-xl font-extrabold text-warning">{kpis.dueTodayCount}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Due This Week</div>
          <div className="mt-1 text-xl font-extrabold text-text">{kpis.dueThisWeekCount}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Upcoming</div>
          <div className="mt-1 text-xl font-extrabold text-text">{kpis.upcomingCount}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-success">Paid This Month</div>
          <div className="mt-1 text-xl font-extrabold text-success">{formatCurrency(kpis.paidThisMonth)}</div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-5 py-3.5 text-[15px] font-bold text-text">Payment Requests</div>
        {payments.length === 0 ? (
          <div className="p-5"><EmptyRow text="No payment requests yet — request one from an invoice's page." /></div>
        ) : (
          <div className="divide-y divide-border">
            {payments.map((p) => (
              <div key={p.id} className="flex flex-col gap-2 px-5 py-3.5 text-[13.5px]">
                <div className="flex items-center justify-between">
                  <div>
                    <Link href={`/supplier-procurement/invoices/${p.supplier_invoice_id}`} className="font-semibold text-text hover:underline">
                      {p.supplier_invoices?.invoice_number ?? "Invoice"}
                    </Link>
                    <span className="ml-2 text-text-secondary">{p.supplier_invoices?.suppliers?.name}</span>
                    <span className="ml-2 font-semibold text-text">{formatCurrency(Number(p.amount))}</span>
                    <span className="ml-2 text-text-muted">{p.companies?.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge tone={p.status === "paid" ? "success" : p.status === "rejected" ? "danger" : "warning"}>
                      {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                    </StatusBadge>
                    <SupplierPaymentActions paymentId={p.id} status={p.status} />
                  </div>
                </div>
                {p.status === "approved" && <PaymentExecutionForm paymentId={p.id} companyId={p.company_id} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
