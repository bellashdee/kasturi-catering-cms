import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getDelivery } from "@/lib/driver/queries";
import { DELIVERY_STATUS_LABEL } from "@/lib/driver/constants";
import { DeliveryStatusSelect } from "@/components/driver/DeliveryStatusSelect";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { DeliveryForm } from "@/components/driver/DeliveryForm";

export default async function DeliveryDetailPage({
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

  let delivery;
  try {
    delivery = await getDelivery(supabase, id);
  } catch {
    notFound();
  }

  const [{ data: allCompanies }, { data: events }, { data: vehicles }, { data: employees }] = await Promise.all([
    supabase.from("companies").select("id, name").order("name"),
    supabase.from("catering_events").select("id, event_name, company_id").eq("company_id", delivery.company_id).order("event_date", { ascending: false }),
    supabase.from("vehicles").select("id, plate_number, company_id").eq("company_id", delivery.company_id).order("plate_number"),
    supabase.from("employees").select("id, full_name, company_id").eq("company_id", delivery.company_id).eq("status", "active").order("full_name"),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <Link href={`/driver-logistics${query}`} className="text-[12.5px] font-semibold text-text-secondary">
            ← Back to Deliveries
          </Link>
          <div className="mt-2 text-[20px] font-extrabold text-text">{delivery.catering_events?.event_name ?? "Delivery"}</div>
          <div className="text-[13px] text-text-secondary">
            {delivery.companies?.name}
            {delivery.scheduled_time && ` · ${new Date(delivery.scheduled_time).toLocaleString("en-MY")}`}
            {delivery.location && ` · ${delivery.location}`}
          </div>
        </div>
        <DeliveryStatusSelect deliveryId={id} status={delivery.status} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Driver</div>
          <div className="mt-1 text-lg font-extrabold text-text">{delivery.employees?.full_name ?? "Not assigned"}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Vehicle</div>
          <div className="mt-1 text-lg font-extrabold text-text">{delivery.vehicles?.plate_number ?? "Not assigned"}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Status</div>
          <div className="mt-1 text-lg font-extrabold text-text">{DELIVERY_STATUS_LABEL[delivery.status] ?? delivery.status}</div>
        </div>
      </div>

      <SectionCard title="Delivery Details">
        <DeliveryForm
          companies={allCompanies ?? []}
          events={events ?? []}
          vehicles={vehicles ?? []}
          employees={employees ?? []}
          deliveryId={id}
          initial={{
            companyId: delivery.company_id,
            cateringEventId: delivery.catering_event_id ?? undefined,
            scheduledTime: delivery.scheduled_time ?? undefined,
            location: delivery.location ?? undefined,
            itemsDescription: delivery.items_description ?? undefined,
            vehicleId: delivery.vehicle_id ?? undefined,
            driverId: delivery.driver_id ?? undefined,
            notes: delivery.notes ?? undefined,
          }}
        />
      </SectionCard>
    </div>
  );
}
