import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMalaysiaDateTime, toMalaysiaInputValue } from "@/lib/format";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listDeliveries } from "@/lib/driver/queries";
import { DELIVERY_STATUS_LABEL } from "@/lib/driver/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { DriverLogisticsSubNav } from "@/components/driver/DriverLogisticsSubNav";
import { OperationRowActions } from "@/components/driver/OperationRowActions";
import { RecordUndoBanner } from "@/components/driver/RecordUndoBanner";
import { MonthFilter } from "@/components/MonthFilter";
import { filterByMonth, monthLabelOf } from "@/lib/monthFilter";

function statusTone(status: string): "success" | "warning" | "danger" | "info" {
  if (status === "delivered") return "success";
  if (status === "cancelled") return "danger";
  if (status === "in_transit") return "info";
  return "warning";
}

export default async function DriverLogisticsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; month?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, month } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const deliveries = filterByMonth(await listDeliveries(supabase, targetCompanyIds), month, (d) => d.scheduled_time);
  const monthLabel = monthLabelOf(month);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Operation Management</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{deliveries.length} {deliveries.length === 1 ? "delivery" : "deliveries"}{monthLabel ? <span className="font-semibold text-text"> · {monthLabel}</span> : null}</p>
        </div>
        <Link href={`/driver-logistics/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Delivery
        </Link>
      </div>

      <DriverLogisticsSubNav />

      <RecordUndoBanner />

      <MonthFilter />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {deliveries.length === 0 ? (
          <EmptyRow text={monthLabel ? "No delivery in this month." : "No deliveries yet. Confirming a catering event, or creating one manually, will list it here."} />
        ) : (
          <div>
            <div className="grid grid-cols-[1.2fr_1.4fr_1fr_1fr_1fr_1fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Scheduled</div>
              <div>Customer / Venue</div>
              <div>Driver / Delivery Person</div>
              <div>Vehicle</div>
              <div>Company</div>
              <div>Status</div>
            </div>
            {deliveries.map((d) => (
              <div key={d.id} className="border-b border-border last:border-b-0">
              <Link
                href={`/driver-logistics/${d.id}${query}`}
                className="grid grid-cols-[1.2fr_1.4fr_1fr_1fr_1fr_1fr] px-5 py-3.5 text-[13.5px] hover:bg-surface-alt"
              >
                <div className="text-text-secondary">{formatMalaysiaDateTime(d.scheduled_time)}</div>
                <div>
                  <div className="font-semibold text-text">{d.catering_events?.customers?.name ?? d.catering_events?.event_name ?? d.location ?? "—"}</div>
                  {(d.catering_events?.location ?? (d.catering_events ? d.location : null)) && (
                    <div className="text-[12px] text-text-muted">{d.catering_events?.location ?? d.location}</div>
                  )}
                </div>
                <div className="text-text-secondary">{d.employees?.full_name ?? (d.delivery_vendors ? `${d.delivery_vendors.name} (external)` : "—")}</div>
                <div className="text-text-secondary">{d.vehicles?.plate_number ?? "—"}</div>
                <div className="text-text-secondary">{d.companies?.name}</div>
                <div>
                  <StatusBadge tone={statusTone(d.status)}>{DELIVERY_STATUS_LABEL[d.status] ?? d.status}</StatusBadge>
                </div>
              </Link>
              <div className="px-5 pb-3">
                <OperationRowActions
                  kind="delivery"
                  id={d.id}
                  initial={{ scheduledTime: toMalaysiaInputValue(d.scheduled_time), location: d.catering_events?.location ?? d.location ?? "", itemsDescription: d.items_description ?? "", notes: d.notes ?? "" }}
                  fullEditHref={`/driver-logistics/${d.id}${query}`}
                />
              </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
