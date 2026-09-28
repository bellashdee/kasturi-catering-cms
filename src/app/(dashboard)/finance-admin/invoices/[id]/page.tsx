import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getCustomerInvoice } from "@/lib/finance/queries";
import { INVOICE_STATUS_LABEL, isOverdue } from "@/lib/finance/constants";
import { formatCurrency } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionCard, EmptyRow } from "@/components/dashboard/SectionCard";
import { RecordCustomerPaymentForm } from "@/components/finance/RecordCustomerPaymentForm";

export default async function CustomerInvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ company?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { id } = await params;
  const { company: requestedId } = await searchParams;
  const query = requestedId ? `?company=${requestedId}` : "";

  const supabase = await createClient();

  let invoice;
  try {
    invoice = await getCustomerInvoice(supabase, id);
  } catch {
    notFound();
  }

  const overdue = isOverdue(invoice.due_date, invoice.status);
  const totalPaid = invoice.customer_payments.reduce((t, p) => t + Number(p.amount), 0);
  const outstanding = Math.max(0, Number(invoice.amount) - totalPaid);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <Link href={`/finance-admin/invoices${query}`} className="text-[12.5px] font-semibold text-text-secondary">
            ← Back to Customer Invoices
          </Link>
          <div className="mt-2 text-[20px] font-extrabold text-text">{invoice.invoice_number}</div>
          <div className="text-[13px] text-text-secondary">
            {invoice.companies?.name} · {invoice.customers?.name ?? "No customer linked"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone={invoice.status === "paid" ? "success" : overdue ? "danger" : "warning"}>
            {INVOICE_STATUS_LABEL[invoice.status] ?? invoice.status}
          </StatusBadge>
          {overdue && <StatusBadge tone="danger">Overdue</StatusBadge>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Amount</div>
          <div className="mt-1 text-xl font-extrabold text-text">{formatCurrency(Number(invoice.amount))}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Due Date</div>
          <div className="mt-1 text-xl font-extrabold text-text">{invoice.due_date}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Outstanding</div>
          <div className="mt-1 text-xl font-extrabold text-text">{formatCurrency(outstanding)}</div>
        </div>
      </div>

      <SectionCard title="Payments">
        <div className="flex flex-col gap-3">
          {invoice.customer_payments.length === 0 ? (
            <EmptyRow text="No payments recorded yet." />
          ) : (
            <div className="-mx-5 -mt-5 mb-1 divide-y divide-border">
              {invoice.customer_payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-2.5 text-[13px]">
                  <span className="font-semibold text-text">{formatCurrency(Number(p.amount))}</span>
                  <span className="text-text-secondary">{p.payment_date}</span>
                </div>
              ))}
            </div>
          )}
          {outstanding > 0 && <RecordCustomerPaymentForm companyId={invoice.company_id} invoiceId={id} outstanding={outstanding} />}
        </div>
      </SectionCard>
    </div>
  );
}
