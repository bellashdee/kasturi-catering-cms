import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getDelivery, listDeliveryPersons } from "@/lib/driver/queries";
import { DELIVERY_STATUS_LABEL } from "@/lib/driver/constants";
import { PROOF_STATUS_LABEL } from "@/lib/taskProofs/constants";
import { listTaskProofs, listTaskAuditLog } from "@/lib/taskProofs/queries";
import { DeliveryStatusSelect } from "@/components/driver/DeliveryStatusSelect";
import { CompleteDeliveryAction } from "@/components/driver/CompleteDeliveryAction";
import { DeliveryProofSection } from "@/components/driver/DeliveryProofSection";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
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

  const [{ data: allCompanies }, { data: events }, { data: vehicles }, deliveryPersons, proofs, auditLog] = await Promise.all([
    supabase.from("companies").select("id, name").order("name"),
    supabase.from("catering_events").select("id, event_name, company_id").eq("company_id", delivery.company_id).order("event_date", { ascending: false }),
    supabase.from("vehicles").select("id, plate_number, company_id").eq("company_id", delivery.company_id).order("plate_number"),
    listDeliveryPersons(supabase, [delivery.company_id]),
    listTaskProofs(supabase, "deliveries", id),
    listTaskAuditLog(supabase, "deliveries", id),
  ]);

  const hasProof = delivery.proof_status === "proof_uploaded" || delivery.proof_status === "completed";
  const isDone = delivery.status === "delivered" || delivery.status === "cancelled";

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
        <div className="flex items-center gap-2">
          {!isDone && <DeliveryStatusSelect deliveryId={id} status={delivery.status} />}
          {!isDone && <CompleteDeliveryAction deliveryId={id} companyId={delivery.company_id} hasProof={hasProof} />}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Driver / Delivery Person</div>
          <div className="mt-1 text-lg font-extrabold text-text">{delivery.employees?.full_name ?? (delivery.delivery_vendors ? `${delivery.delivery_vendors.name} (external)` : "Not assigned")}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Vehicle</div>
          <div className="mt-1 text-lg font-extrabold text-text">{delivery.vehicles?.plate_number ?? "Not assigned"}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Status</div>
          <div className="mt-1 text-lg font-extrabold text-text">{DELIVERY_STATUS_LABEL[delivery.status] ?? delivery.status}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Proof Status</div>
          <div className="mt-1">
            <StatusBadge tone={delivery.proof_status === "completed" ? "success" : delivery.proof_status === "no_proof" ? "neutral" : "warning"}>
              {PROOF_STATUS_LABEL[delivery.proof_status] ?? delivery.proof_status}
            </StatusBadge>
            {delivery.admin_override && <div className="mt-1 text-[11px] text-warning">Admin override: {delivery.admin_override_reason}</div>}
          </div>
        </div>
      </div>

      <SectionCard title="Proof of Delivery">
        <DeliveryProofSection companyId={delivery.company_id} deliveryId={id} proofs={proofs} />
      </SectionCard>

      {auditLog.length > 0 && (
        <SectionCard title="Task History">
          <div className="flex flex-col gap-2">
            {auditLog.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between border-b border-border pb-2 text-[12.5px] last:border-b-0">
                <div className="text-text">
                  <span className="font-semibold">{entry.action.replace(/_/g, " ")}</span>
                  {entry.reason && <span className="text-text-muted"> — {entry.reason}</span>}
                </div>
                <div className="text-text-muted">{new Date(entry.created_at).toLocaleString("en-MY")}</div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Delivery Details">
        <DeliveryForm
          companies={allCompanies ?? []}
          events={events ?? []}
          vehicles={vehicles ?? []}
          deliveryPersons={deliveryPersons}
          deliveryId={id}
          initial={{
            companyId: delivery.company_id,
            cateringEventId: delivery.catering_event_id ?? undefined,
            scheduledTime: delivery.scheduled_time ?? undefined,
            location: delivery.location ?? undefined,
            itemsDescription: delivery.items_description ?? undefined,
            vehicleId: delivery.vehicle_id ?? undefined,
            driverId: delivery.driver_id ?? undefined,
            vendorId: delivery.delivery_vendor_id ?? undefined,
            notes: delivery.notes ?? undefined,
          }}
        />
      </SectionCard>
    </div>
  );
}
