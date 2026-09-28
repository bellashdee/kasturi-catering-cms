import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listProductionOrders } from "@/lib/kitchen/queries";
import { PRODUCTION_STATUS_LABEL } from "@/lib/kitchen/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { KitchenSubNav } from "@/components/kitchen/KitchenSubNav";

function statusTone(status: string): "success" | "warning" | "info" {
  if (status === "completed") return "success";
  if (status === "in_progress") return "info";
  return "warning";
}

export default async function KitchenPage({
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

  const orders = await listProductionOrders(supabase, targetCompanyIds);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Kitchen</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{orders.length} production order{orders.length === 1 ? "" : "s"}</p>
        </div>
        <Link href={`/kitchen/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Production Order
        </Link>
      </div>

      <KitchenSubNav />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {orders.length === 0 ? (
          <EmptyRow text="No production orders yet. Confirming a catering event, or creating one manually, will list it here." />
        ) : (
          <div>
            <div className="grid grid-cols-[1fr_1.4fr_0.8fr_0.8fr_1.4fr_1fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Planned Date</div>
              <div>Recipe</div>
              <div>Pax</div>
              <div>Company</div>
              <div>Linked Event</div>
              <div>Status</div>
            </div>
            {orders.map((o) => (
              <Link
                key={o.id}
                href={`/kitchen/${o.id}${query}`}
                className="grid grid-cols-[1fr_1.4fr_0.8fr_0.8fr_1.4fr_1fr] border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0 hover:bg-surface-alt"
              >
                <div className="text-text-secondary">{o.planned_date}</div>
                <div className="font-semibold text-text">{o.recipes?.name ?? "—"}</div>
                <div className="text-text-secondary">{o.pax_count ?? "—"}</div>
                <div className="text-text-secondary">{o.companies?.name}</div>
                <div className="text-text-secondary">{o.catering_events?.event_name ?? "—"}</div>
                <div>
                  <StatusBadge tone={statusTone(o.status)}>{PRODUCTION_STATUS_LABEL[o.status] ?? o.status}</StatusBadge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
