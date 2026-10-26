import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getProcurementRequest } from "@/lib/procurement/queries";
import { PROCUREMENT_REQUEST_STATUS_LABEL } from "@/lib/procurement/constants";
import { formatCurrency, formatMalaysiaDate } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { ProcurementRequestActions } from "@/components/procurement/ProcurementRequestActions";
import { RequestEditActions } from "@/components/procurement/ProcurementRecordActions";

function statusTone(status: string): "success" | "warning" | "danger" | "info" {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  if (status === "converted") return "info";
  return "warning";
}

export default async function ProcurementRequestDetailPage({
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

  let request;
  try {
    request = await getProcurementRequest(supabase, id);
  } catch {
    notFound();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <Link href={`/supplier-procurement/orders${query}`} className="text-[12.5px] font-semibold text-text-secondary">
            ← Back to Purchase Orders
          </Link>
          <div className="mt-2 text-[20px] font-extrabold text-text">{request.item_name}</div>
          <div className="text-[13px] text-text-secondary">
            {request.companies?.name}
            {request.department && ` · ${request.department}`}
            {` · Requested${request.profiles?.full_name ? ` by ${request.profiles.full_name}` : ""} on ${formatMalaysiaDate(request.created_at)}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone={statusTone(request.status)}>{PROCUREMENT_REQUEST_STATUS_LABEL[request.status] ?? request.status}</StatusBadge>
          <ProcurementRequestActions requestId={id} status={request.status} />
          <RequestEditActions
            listHref={`/supplier-procurement/orders${query}`}
            request={{ id, itemName: request.item_name, quantity: String(request.quantity), estimatedCost: request.estimated_cost === null ? "" : String(request.estimated_cost), department: request.department ?? "", reason: request.reason ?? "", status: request.status }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Quantity</div>
          <div className="mt-1 text-xl font-extrabold text-text">{request.quantity}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Estimated Cost</div>
          <div className="mt-1 text-xl font-extrabold text-text">{request.estimated_cost != null ? formatCurrency(Number(request.estimated_cost)) : "—"}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Status</div>
          <div className="mt-1 text-xl font-extrabold text-text">{PROCUREMENT_REQUEST_STATUS_LABEL[request.status] ?? request.status}</div>
        </div>
      </div>

      {request.reason && (
        <div className="rounded-xl border border-border bg-surface p-4 text-[13px] shadow-sm">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">Reason</div>
          {request.reason}
        </div>
      )}

      {request.status === "approved" && (
        <div className="rounded-lg border border-[#CFE1F2] bg-info-bg px-3.5 py-3 text-[13px] text-[#0F3A63]">
          Approved — ready to turn into a purchase order.{" "}
          <Link
            href={`/supplier-procurement/orders/new?request=${id}&item=${encodeURIComponent(request.item_name)}&qty=${request.quantity}${request.company_id ? `&company=${request.company_id}` : ""}`}
            className="font-bold underline"
          >
            Create Purchase Order
          </Link>
        </div>
      )}

      {request.status === "converted" && request.purchase_order_id && (
        <div className="rounded-lg border border-[#CFE1F2] bg-info-bg px-3.5 py-3 text-[13px] text-[#0F3A63]">
          Converted to a purchase order.{" "}
          <Link href={`/supplier-procurement/orders/${request.purchase_order_id}${query}`} className="font-bold underline">
            View Purchase Order
          </Link>
        </div>
      )}
    </div>
  );
}
