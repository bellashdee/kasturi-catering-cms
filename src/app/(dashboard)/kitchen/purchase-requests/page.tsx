import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listPurchaseRequests } from "@/lib/kitchen/queries";
import { PURCHASE_REQUEST_STATUS_LABEL } from "@/lib/kitchen/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { KitchenSubNav } from "@/components/kitchen/KitchenSubNav";
import { PurchaseRequestActions } from "@/components/kitchen/PurchaseRequestActions";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";

function statusTone(status: string): "success" | "warning" | "danger" | "info" {
  if (status === "completed") return "success";
  if (status === "rejected") return "danger";
  if (status === "approved" || status === "ordered") return "info";
  return "warning";
}

export default async function PurchaseRequestsPage({
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

  const requests = await listPurchaseRequests(supabase, targetCompanyIds);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Kitchen</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{requests.length} purchase request{requests.length === 1 ? "" : "s"}</p>
        </div>
        <Link href={`/kitchen/purchase-requests/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Purchase Request
        </Link>
      </div>

      <KitchenSubNav />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {requests.length === 0 ? (
          <EmptyRow text="No purchase requests yet." />
        ) : (
          <div>
            <div className="grid grid-cols-[1.3fr_0.9fr_0.9fr_0.9fr_0.8fr_0.9fr_1.3fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Ingredient</div>
              <div>Quantity</div>
              <div>Supplier</div>
              <div>Company</div>
              <div>Required</div>
              <div>Status</div>
              <div></div>
            </div>
            {requests.map((r) => (
              <div key={r.id} className="grid grid-cols-[1.3fr_0.9fr_0.9fr_0.9fr_0.8fr_0.9fr_1.3fr] items-center border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0">
                <div className="font-semibold text-text">
                  {r.ingredients?.name ?? "—"}
                  {r.document_id && <DocumentViewLink documentId={r.document_id} className="ml-2 text-xs" />}
                </div>
                <div className="text-text-secondary">{r.quantity_requested} {r.unit ?? r.ingredients?.unit_of_measure ?? ""}</div>
                <div className="text-text-secondary">{r.suppliers?.name ?? "—"}</div>
                <div className="text-text-secondary">{r.companies?.name}</div>
                <div className="text-text-secondary">{r.required_date ?? "—"}</div>
                <div><StatusBadge tone={statusTone(r.status)}>{PURCHASE_REQUEST_STATUS_LABEL[r.status] ?? r.status}</StatusBadge></div>
                <div className="flex justify-end"><PurchaseRequestActions requestId={r.id} status={r.status} /></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
