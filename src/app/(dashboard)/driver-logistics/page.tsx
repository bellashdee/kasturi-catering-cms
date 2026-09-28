import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listDeliveries } from "@/lib/driver/queries";
import { DELIVERY_STATUS_LABEL } from "@/lib/driver/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { DriverLogisticsSubNav } from "@/components/driver/DriverLogisticsSubNav";

function statusTone(status: string): "success" | "warning" | "danger" | "info" {
  if (status === "delivered") return "success";
  if (status === "cancelled") return "danger";
  if (status === "in_transit") return "info";
  return "warning";
}

export default async function DriverLogisticsPage({
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

  const deliveries = await listDeliveries(supabase, targetCompanyIds);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Driver & Logistics</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{deliveries.length} {deliveries.length === 1 ? "delivery" : "deliveries"}</p>
        </div>
        <Link href={`/driver-logistics/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Delivery
        </Link>
      </div>

      <DriverLogisticsSubNav />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {deliveries.length === 0 ? (
          <EmptyRow text="No deliveries yet. Confirming a catering event, or creating one manually, will list it here." />
        ) : (
          <div>
            <div className="grid grid-cols-[1.2fr_1.4fr_1fr_1fr_1fr_1fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Scheduled</div>
              <div>Event / Location</div>
              <div>Driver</div>
              <div>Vehicle</div>
              <div>Company</div>
              <div>Status</div>
            </div>
            {deliveries.map((d) => (
              <Link
                key={d.id}
                href={`/driver-logistics/${d.id}${query}`}
                className="grid grid-cols-[1.2fr_1.4fr_1fr_1fr_1fr_1fr] border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0 hover:bg-surface-alt"
              >
                <div className="text-text-secondary">{d.scheduled_time ? new Date(d.scheduled_time).toLocaleString("en-MY") : "—"}</div>
                <div className="font-semibold text-text">{d.catering_events?.event_name ?? d.location ?? "—"}</div>
                <div className="text-text-secondary">{d.employees?.full_name ?? "—"}</div>
                <div className="text-text-secondary">{d.vehicles?.plate_number ?? "—"}</div>
                <div className="text-text-secondary">{d.companies?.name}</div>
                <div>
                  <StatusBadge tone={statusTone(d.status)}>{DELIVERY_STATUS_LABEL[d.status] ?? d.status}</StatusBadge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
