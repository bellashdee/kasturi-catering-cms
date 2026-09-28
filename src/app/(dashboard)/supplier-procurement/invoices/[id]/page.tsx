import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getSupplierInvoice } from "@/lib/procurement/queries";
import { INVOICE_STATUS_LABEL, PAYMENT_STATUS_LABEL, isOverdue } from "@/lib/procurement/constants";
import { formatCurrency } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionCard, EmptyRow } from "@/components/dashboard/SectionCard";
import { RequestPaymentForm } from "@/components/procurement/RequestPaymentForm";
import { SupplierPaymentActions } from "@/components/procurement/SupplierPaymentActions";
import { PaymentExecutionForm } from "@/components/procurement/PaymentExecutionForm";

export default async function SupplierInvoiceDetailPage({
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
    invoice = await getSupplierInvoice(supabase, id);
  } catch {
    notFound();
  }

  const overdue = isOverdue(invoice.due_date, invoice.status);
  const requestedTotal = invoice.supplier_payments.reduce((t, p) => t + (p.status !== "rejected" ? Number(p.amount) : 0), 0);
  const outstanding = Math.max(0, Number(invoice.amount) - requestedTotal);
  const hasPendingPayment = invoice.supplier_payments.some((p) => p.status === "pending" || p.status === "approved");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <Link href={`/supplier-procurement/invoices${query}`} className="text-[12.5px] font-semibold text-text-secondary">
            ← Back to Invoices
          </Link>
          <div className="mt-2 text-[20px] font-extrabold text-text">{invoice.invoice_number}</div>
          <div className="text-[13px] text-text-secondary">
            {invoice.companies?.name} · {invoice.suppliers?.name}
            {invoice.department && ` · ${invoice.department}`}
            {invoice.purchase_orders?.po_number && (
              <>
                {" · "}
                <Link href={`/supplier-procurement/orders/${invoice.purchase_orders.id}${query}`} className="underline">
                  {invoice.purchase_orders.po_number}
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone={invoice.status === "paid" ? "success" : overdue ? "danger" : "warning"}>
            {INVOICE_STATUS_LABEL[invoice.status] ?? invoice.status}
          </StatusBadge>
          {overdue && <StatusBadge tone="danger">Overdue</StatusBadge>}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
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
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Attachment</div>
          <div className="mt-1 text-[13px]">
            {invoice.documents ? (
              <span className="font-semibold text-primary">{invoice.documents.original_filename}</span>
            ) : (
              <span className="text-text-muted">None</span>
            )}
          </div>
        </div>
      </div>

      <SectionCard title="Items">
        {invoice.supplier_invoice_items.length === 0 ? (
          <EmptyRow text="No line items recorded." />
        ) : (
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {invoice.supplier_invoice_items.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-5 py-3 text-[13px]">
                <span className="font-semibold text-text">{item.item_name}</span>
                <span className="text-text-secondary">{item.quantity} × {formatCurrency(Number(item.unit_price))} = {formatCurrency(Number(item.line_total))}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Payments">
        <div className="flex flex-col gap-3">
          {invoice.supplier_payments.length === 0 ? (
            <EmptyRow text="No payment requests yet." />
          ) : (
            <div className="-mx-5 -mt-5 mb-1 divide-y divide-border">
              {invoice.supplier_payments.map((p) => (
                <div key={p.id} className="flex flex-col gap-2 px-5 py-3 text-[13px]">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-text">{formatCurrency(Number(p.amount))}</span>
                      {p.payment_method && <span className="ml-2 text-text-muted">{p.payment_method.replace("_", " ")}</span>}
                      {p.reference_number && <span className="ml-2 text-text-muted">Ref: {p.reference_number}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge tone={p.status === "paid" ? "success" : p.status === "rejected" ? "danger" : "warning"}>
                        {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                      </StatusBadge>
                      <SupplierPaymentActions paymentId={p.id} status={p.status} />
                    </div>
                  </div>
                  {p.status === "approved" && <PaymentExecutionForm paymentId={p.id} companyId={invoice.company_id} />}
                </div>
              ))}
            </div>
          )}
          {!hasPendingPayment && outstanding > 0 && (
            <RequestPaymentForm companyId={invoice.company_id} invoiceId={id} outstanding={outstanding} />
          )}
        </div>
      </SectionCard>
    </div>
  );
}
