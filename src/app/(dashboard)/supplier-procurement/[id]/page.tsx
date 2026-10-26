import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getSupplier } from "@/lib/procurement/queries";
import { SUPPLIER_STATUS_LABEL, INVOICE_STATUS_LABEL, PO_STATUS_LABEL } from "@/lib/procurement/constants";
import { formatCurrency, formatMalaysiaDate, formatUnitPrice } from "@/lib/format";
import { listPurchaseLines, summariseSupplierItems } from "@/lib/procurement/purchaseLines";
import { StatusBadge } from "@/components/StatusBadge";
import { SupplierDeleteAction } from "@/components/procurement/ProcurementRecordActions";
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

  const [{ data: orders }, { data: invoices }, purchaseLines] = await Promise.all([
    supabase.from("purchase_orders").select("id, po_number, status, total_amount, order_date").eq("supplier_id", id).order("order_date", { ascending: false }).limit(10),
    supabase.from("supplier_invoices").select("id, invoice_number, status, amount, due_date").eq("supplier_id", id).order("invoice_date", { ascending: false }).limit(10),
    listPurchaseLines(supabase, [supplier.company_id], { supplierIds: [id] }),
  ]);
  const soldItems = summariseSupplierItems(purchaseLines)[0]?.items ?? [];

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
          <SupplierDeleteAction supplierId={id} name={supplier.name} listHref={`/supplier-procurement${query}`} />
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

      {(supplier.registration_no || supplier.billing_address || supplier.email || supplier.credit_limit || supplier.account_code) && (
        <SectionCard title="Supplier details">
          <div className="grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
            {([
              ["Registration no.", supplier.registration_no],
              ["Email", supplier.email],
              ["Address", supplier.billing_address],
              ["Area", supplier.area],
              ["Credit limit", supplier.credit_limit ? formatCurrency(Number(supplier.credit_limit)) : null],
              ["AutoCount account", supplier.account_code],
            ] as const).filter(([, v]) => v).map(([label, value]) => (
              <div key={label}>
                <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{label}</div>
                <div className="mt-0.5 font-semibold text-text">{value}</div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard
        title={`Items sold & price per unit (${soldItems.length})`}
        action={
          <Link href={`/supplier-procurement/items?supplier=${encodeURIComponent(supplier.name)}${requestedId ? `&company=${requestedId}` : ""}`} className="text-[12.5px] font-semibold text-primary">
            Open in Items & Prices
          </Link>
        }
      >
        {soldItems.length === 0 ? (
          <EmptyRow text="No purchase lines recorded for this supplier yet." />
        ) : (
          <div className="-mx-5 -mb-5 max-h-[28rem] overflow-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead className="sticky top-0 bg-surface-alt">
                <tr className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  <th className="px-5 py-2.5">Item</th>
                  <th className="px-3 py-2.5">UOM</th>
                  <th className="px-3 py-2.5 text-right">Latest price / unit</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-5 py-2.5 text-right">Bought</th>
                </tr>
              </thead>
              <tbody>
                {soldItems.map((i) => (
                  <tr key={i.key} className="border-t border-border text-[13px]">
                    <td className="px-5 py-2.5 font-semibold text-text">{i.description}</td>
                    <td className="px-3 py-2.5 text-text-secondary">{i.uom || "—"}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-text">{formatUnitPrice(i.latestPrice)}</td>
                    <td className="px-3 py-2.5 text-text-secondary">{formatMalaysiaDate(`${i.latestDate}T12:00:00+08:00`)}</td>
                    <td className="px-5 py-2.5 text-right text-text-secondary">{`${i.timesBought}×`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

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
