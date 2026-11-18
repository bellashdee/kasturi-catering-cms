import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getSupplierInvoice } from "@/lib/procurement/queries";
import { PAYMENT_STATUS_LABEL } from "@/lib/procurement/constants";
import { formatCurrency, formatUnitPrice } from "@/lib/format";
import { PrintDocumentButton } from "@/components/shared/PrintDocumentButton";
import { StatusBadge } from "@/components/StatusBadge";
import { InvoiceActions } from "@/components/procurement/ProcurementRecordActions";
import { SectionCard, EmptyRow } from "@/components/dashboard/SectionCard";
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

  // the AutoCount customer invoice (and its event) this cost belongs to: the cost counts in that event's P&L
  const { data: autoCountMatches } = invoice.autocount_invoice_no ? await supabase.rpc("find_autocount_customer_invoice", { p_number: invoice.autocount_invoice_no }) : { data: null };
  const autoCountEvent = (autoCountMatches ?? []).find((m) => m.catering_event_id) ?? null;
  const autoCountOnly = (autoCountMatches ?? [])[0] ?? null;

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
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PrintDocumentButton
            document={{
              type: "PURCHASE INVOICE",
              number: invoice.invoice_number,
              date: invoice.invoice_date,
              dueDate: invoice.due_date,
              terms: invoice.suppliers?.payment_terms,
              company: { name: invoice.companies?.legal_name || invoice.companies?.name || "", registrationNo: invoice.companies?.registration_no },
              party: { label: "FROM (SUPPLIER)", name: invoice.suppliers?.name ?? "", address: invoice.suppliers?.billing_address, phone: invoice.suppliers?.phone, registrationNo: invoice.suppliers?.registration_no },
              reference: invoice.autocount_invoice_no,
              lines: invoice.supplier_invoice_items.map((i) => ({ code: i.item_code, description: i.item_name, quantity: Number(i.quantity), uom: i.uom, unitPrice: Number(i.unit_price), discount: Number(i.discount ?? 0), amount: Number(i.line_total) })),
            }}
          />
          <InvoiceActions
            listHref={`/supplier-procurement/invoices${query}`}
            invoice={{
              id,
              invoiceNumber: invoice.invoice_number,
              invoiceDate: invoice.invoice_date,
              dueDate: invoice.due_date,
              amount: String(invoice.amount),
              department: invoice.department ?? "",
              autoCountInvoiceNo: invoice.autocount_invoice_no ?? "",
              items: invoice.supplier_invoice_items.map((i) => ({ itemCode: i.item_code ?? "", itemName: i.item_name, uom: i.uom ?? "", quantity: String(i.quantity), unitPrice: String(i.unit_price), discount: i.discount === null ? "" : String(i.discount), lineTotal: String(i.line_total) })),
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Amount</div>
          <div className="mt-1 text-xl font-extrabold text-text">{formatCurrency(Number(invoice.amount))}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Due Date</div>
          <div className="mt-1 text-xl font-extrabold text-text">{invoice.due_date}</div>
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
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">AutoCount Invoice No.</div>
          <div className="mt-1 text-[15px] font-extrabold text-text">{invoice.autocount_invoice_no ?? "—"}</div>
          <div className="mt-1 text-[12px]">
            {!invoice.autocount_invoice_no ? (
              <span className="text-text-muted">Not linked to an event.</span>
            ) : autoCountEvent ? (
              <>
                <Link href={`/finance/event-pnl/${autoCountEvent.catering_event_id}`} className="font-semibold text-primary hover:underline">
                  {`${autoCountEvent.event_reference ? `${autoCountEvent.event_reference} · ` : ""}${autoCountEvent.event_name ?? ""}`}
                </Link>
                <span className="block text-text-secondary">{`Customer: ${autoCountEvent.customer_name ?? "—"}`}</span>
              </>
            ) : autoCountOnly ? (
              <span className="font-semibold text-warning">This AutoCount invoice is not linked to any event yet.</span>
            ) : (
              <span className="font-semibold text-warning">Not in the system yet: counts in the event P&amp;L once that AutoCount invoice is uploaded.</span>
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
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-x-4 px-5 py-3 text-[13px]">
                <span className="font-semibold text-text">
                  {item.item_code && <span className="mr-2 font-normal text-text-muted">{item.item_code}</span>}
                  {item.item_name}
                </span>
                <span className="text-text-secondary">
                  {Number(item.quantity)}
                  {item.uom ? ` ${item.uom}` : ""} × {formatUnitPrice(Number(item.unit_price))}
                  {item.discount !== null && Number(item.discount) !== 0 ? ` − ${formatUnitPrice(Number(item.discount))} discount` : ""} = {formatCurrency(Number(item.line_total))}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {invoice.supplier_payments.length > 0 && (
      <SectionCard title="Payments">
        <div className="flex flex-col gap-3">
          {(
            <div className="-mx-5 -mb-5 divide-y divide-border">
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
        </div>
      </SectionCard>
      )}
    </div>
  );
}
