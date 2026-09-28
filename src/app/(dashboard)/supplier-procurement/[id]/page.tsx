import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getSupplier } from "@/lib/procurement/queries";
import { SUPPLIER_STATUS_LABEL, INVOICE_STATUS_LABEL, PO_STATUS_LABEL } from "@/lib/procurement/constants";
import { formatCurrency } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionCard, EmptyRow } from "@/components/dashboard/SectionCard";

export default async function SupplierDetailPage({
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

  let supplier;
  try {
    supplier = await getSupplier(supabase, id);
  } catch {
    notFound();
  }

  const [{ data: orders }, { data: invoices }] = await Promise.all([
    supabase.from("purchase_orders").select("id, po_number, status, total_amount, order_date").eq("supplier_id", id).order("order_date", { ascending: false }).limit(10),
    supabase.from("supplier_invoices").select("id, invoice_number, status, amount, due_date").eq("supplier_id", id).order("invoice_date", { ascending: false }).limit(10),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <Link href={`/supplier-procurement${query}`} className="text-[12.5px] font-semibold text-text-secondary">
            ← Back to Suppliers
          </Link>
          <div className="mt-2 text-[20px] font-extrabold text-text">{supplier.name}</div>
          <div className="text-[13px] text-text-secondary">
            {supplier.companies?.name}
            {supplier.category && ` · ${supplier.category}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone={supplier.status === "active" ? "success" : supplier.status === "blacklisted" ? "danger" : "neutral"}>
            {SUPPLIER_STATUS_LABEL[supplier.status] ?? supplier.status}
          </StatusBadge>
          <Link href={`/supplier-procurement/${id}/edit${query}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-[13px] font-semibold text-text">
            Edit
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Contact Person</div>
          <div className="mt-1 text-lg font-extrabold text-text">{supplier.contact_person ?? "—"}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Phone</div>
          <div className="mt-1 text-lg font-extrabold text-text">{supplier.phone ?? "—"}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Payment Terms</div>
          <div className="mt-1 text-lg font-extrabold text-text">{supplier.payment_terms ?? "—"}</div>
        </div>
      </div>

      <SectionCard title="Recent Purchase Orders" action={<Link href={`/supplier-procurement/orders/new?supplier=${id}${requestedId ? `&company=${requestedId}` : ""}`} className="text-[12.5px] font-semibold text-primary">+ New PO</Link>}>
        {!orders || orders.length === 0 ? (
          <EmptyRow text="No purchase orders yet." />
        ) : (
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {orders.map((o) => (
              <Link key={o.id} href={`/supplier-procurement/orders/${o.id}${query}`} className="flex items-center justify-between px-5 py-3 text-[13px] hover:bg-surface-alt">
                <span className="font-semibold text-text">{o.po_number}</span>
                <div className="flex items-center gap-3">
                  <span className="text-text-secondary">{formatCurrency(Number(o.total_amount))}</span>
                  <StatusBadge tone="neutral">{PO_STATUS_LABEL[o.status] ?? o.status}</StatusBadge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Recent Invoices">
        {!invoices || invoices.length === 0 ? (
          <EmptyRow text="No invoices yet." />
        ) : (
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {invoices.map((i) => (
              <Link key={i.id} href={`/supplier-procurement/invoices/${i.id}${query}`} className="flex items-center justify-between px-5 py-3 text-[13px] hover:bg-surface-alt">
                <span className="font-semibold text-text">{i.invoice_number}</span>
                <div className="flex items-center gap-3">
                  <span className="text-text-secondary">{formatCurrency(Number(i.amount))} · due {i.due_date}</span>
                  <StatusBadge tone={i.status === "paid" ? "success" : "warning"}>{INVOICE_STATUS_LABEL[i.status] ?? i.status}</StatusBadge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
