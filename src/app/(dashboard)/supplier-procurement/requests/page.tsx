import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listProcurementRequests } from "@/lib/procurement/queries";
import { PROCUREMENT_REQUEST_STATUS_LABEL } from "@/lib/procurement/constants";
import { formatCurrency } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { SupplierProcurementSubNav } from "@/components/procurement/SupplierProcurementSubNav";
import { ProcurementRequestActions } from "@/components/procurement/ProcurementRequestActions";

function statusTone(status: string): "success" | "warning" | "danger" | "info" {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  if (status === "converted") return "info";
  return "warning";
}

export default async function ProcurementRequestsPage({
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

  const requests = await listProcurementRequests(supabase, targetCompanyIds);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Supplier & Procurement</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{requests.length} purchase request{requests.length === 1 ? "" : "s"}</p>
        </div>
        <Link href={`/supplier-procurement/requests/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Purchase Request
        </Link>
      </div>

      <SupplierProcurementSubNav />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {requests.length === 0 ? (
          <EmptyRow text="No purchase requests yet." />
        ) : (
          <div>
            <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr_1.2fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Item</div>
              <div>Requester</div>
              <div>Department</div>
              <div>Est. Cost</div>
              <div>Status</div>
              <div></div>
            </div>
            {requests.map((r) => (
              <div key={r.id} className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr_1.2fr] items-center border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0">
                <Link href={`/supplier-procurement/requests/${r.id}${query}`} className="font-semibold text-text hover:underline">
                  {r.item_name} <span className="font-normal text-text-muted">× {r.quantity}</span>
                </Link>
                <div className="text-text-secondary">{r.profiles?.full_name ?? "—"}</div>
                <div className="text-text-secondary">{r.department ?? "—"}</div>
                <div className="text-text-secondary">{r.estimated_cost != null ? formatCurrency(Number(r.estimated_cost)) : "—"}</div>
                <div><StatusBadge tone={statusTone(r.status)}>{PROCUREMENT_REQUEST_STATUS_LABEL[r.status] ?? r.status}</StatusBadge></div>
                <div className="flex justify-end"><ProcurementRequestActions requestId={r.id} status={r.status} /></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
