import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import {
  getEvent,
  listQuotationsForEvent,
  getCosting,
  listStaffForEvent,
  listEquipmentForEvent,
  listEquipmentForCompanies,
  getDeliveryForEvent,
} from "@/lib/catering/queries";
import {
  EVENT_STATUS_LABEL,
  EVENT_TYPE_LABEL,
  MEAL_TYPE_LABEL,
  SERVICE_TYPE_LABEL,
  QUOTATION_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  STAFF_ROLE_LABEL,
} from "@/lib/catering/constants";
import { formatCurrency } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionCard, EmptyRow } from "@/components/dashboard/SectionCard";
import { EventStatusSelect } from "@/components/catering/EventStatusSelect";
import { QuotationActions } from "@/components/catering/QuotationActions";
import { CostingForm } from "@/components/catering/CostingForm";
import { StaffAssignForm } from "@/components/catering/StaffAssignForm";
import { EquipmentAssignForm } from "@/components/catering/EquipmentAssignForm";
import { DeliveryForm } from "@/components/catering/DeliveryForm";
import { listDeliveryPersons } from "@/lib/driver/queries";
import { RemoveAssignmentButton } from "@/components/catering/RemoveAssignmentButton";

function quotationTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "accepted") return "success";
  if (status === "rejected") return "danger";
  if (status === "sent") return "warning";
  return "neutral";
}

export default async function EventDetailPage({
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

  let event;
  try {
    event = await getEvent(supabase, id);
  } catch {
    notFound();
  }

  const [quotations, costing, staff, eventEquipment, companyEquipment, delivery, employeesRes, vehiclesRes] = await Promise.all([
    listQuotationsForEvent(supabase, id),
    getCosting(supabase, id),
    listStaffForEvent(supabase, id),
    listEquipmentForEvent(supabase, id),
    listEquipmentForCompanies(supabase, [event.company_id]),
    getDeliveryForEvent(supabase, id),
    supabase.from("employees").select("id, full_name").eq("company_id", event.company_id).eq("status", "active").order("full_name"),
    supabase.from("vehicles").select("id, plate_number").eq("company_id", event.company_id).order("plate_number"),
  ]);

  const employees = employeesRes.data ?? [];
  const deliveryPersons = await listDeliveryPersons(supabase, [event.company_id]);
  const vehicles = vehiclesRes.data ?? [];
  const revenue = event.total_amount ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <Link href={`/catering${query}`} className="text-[12.5px] font-semibold text-text-secondary">
            ← Back to Events
          </Link>
          <div className="mt-2 text-[20px] font-extrabold text-text">{event.event_name}</div>
          <div className="text-[13px] text-text-secondary">
            {event.customers?.name ?? "No customer linked"} · {event.companies?.name} · {event.event_date}
            {event.event_time && ` ${event.event_time}`}
            {event.location && ` · ${event.location}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <EventStatusSelect eventId={id} status={event.status} />
          <Link href={`/catering/${id}/edit${query}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-[13px] font-semibold text-text">
            Edit
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Pax</div>
          <div className="mt-1 text-xl font-extrabold text-text">{event.pax_count ?? "—"}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Event Type</div>
          <div className="mt-1 text-xl font-extrabold text-text">{EVENT_TYPE_LABEL[event.event_type] ?? event.event_type}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Revenue</div>
          <div className="mt-1 text-xl font-extrabold text-text">{formatCurrency(revenue)}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Status</div>
          <div className="mt-1 text-xl font-extrabold text-text">{EVENT_STATUS_LABEL[event.status] ?? event.status}</div>
        </div>
      </div>

      {(event.meal_types?.length > 0 || event.service_type) && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          {event.meal_types?.map((m: string) => <StatusBadge key={m} tone="info">{MEAL_TYPE_LABEL[m] ?? m}</StatusBadge>)}
          {event.service_type && <StatusBadge tone="success">{SERVICE_TYPE_LABEL[event.service_type] ?? event.service_type}{event.service_pax ? ` · ${event.service_pax} pax` : ""}</StatusBadge>}
          {event.second_service_type && <StatusBadge tone="neutral">{SERVICE_TYPE_LABEL[event.second_service_type] ?? event.second_service_type}{event.second_service_pax ? ` · ${event.second_service_pax} pax` : ""}</StatusBadge>}
        </div>
      )}

      {(event.event_details || event.remarks) && (
        <div className="grid grid-cols-2 gap-4">
          {event.event_details && (
            <div className="whitespace-pre-line rounded-xl border border-border bg-surface p-4 text-[13px] shadow-sm">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">Event details</div>
              {event.event_details}
            </div>
          )}
          {event.remarks && (
            <div className="whitespace-pre-line rounded-xl border border-border bg-surface p-4 text-[13px] shadow-sm">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">Remarks</div>
              {event.remarks}
            </div>
          )}
        </div>
      )}

      {(event.menu_description || event.special_requirements) && (
        <div className="grid grid-cols-2 gap-4">
          {event.menu_description && (
            <div className="rounded-xl border border-border bg-surface p-4 text-[13px] shadow-sm">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">Menu details</div>
              {event.menu_description}
            </div>
          )}
          {event.special_requirements && (
            <div className="rounded-xl border border-border bg-surface p-4 text-[13px] shadow-sm">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">Special Requirements</div>
              {event.special_requirements}
            </div>
          )}
        </div>
      )}

      <SectionCard title="Quotations" action={<Link href={`/catering/${id}/quotations/new${query}`} className="text-[12.5px] font-semibold text-primary">+ New Quotation</Link>}>
        {quotations.length === 0 ? (
          <EmptyRow text="No quotations yet." />
        ) : (
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {quotations.map((q) => (
              <div key={q.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="text-[13px] font-semibold text-text">{q.quotation_number} · {formatCurrency(q.total_amount)}</div>
                  <div className="text-xs text-text-muted">{q.quotation_items?.length ?? 0} item(s) · Payment: {PAYMENT_STATUS_LABEL[q.payment_status] ?? q.payment_status}</div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge tone={quotationTone(q.status)}>{QUOTATION_STATUS_LABEL[q.status] ?? q.status}</StatusBadge>
                  <QuotationActions quotationId={q.id} status={q.status} paymentStatus={q.payment_status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Costing">
        <CostingForm companyId={event.company_id} eventId={id} revenue={revenue} initial={costing} />
      </SectionCard>

      <SectionCard title="Staff">
        <div className="flex flex-col gap-3">
          {staff.length === 0 ? (
            <EmptyRow text="No staff assigned yet." />
          ) : (
            <div className="-mx-5 -mt-5 mb-1 divide-y divide-border">
              {staff.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-5 py-2.5 text-[13px]">
                  <div>
                    <span className="font-semibold text-text">{s.employees?.full_name}</span>
                    <span className="ml-2 text-text-muted">{STAFF_ROLE_LABEL[s.role] ?? s.role}</span>
                  </div>
                  <RemoveAssignmentButton kind="staff" assignmentId={s.id} eventId={id} />
                </div>
              ))}
            </div>
          )}
          <StaffAssignForm companyId={event.company_id} eventId={id} employees={employees} />
        </div>
      </SectionCard>

      <SectionCard title="Equipment">
        <div className="flex flex-col gap-3">
          {eventEquipment.length === 0 ? (
            <EmptyRow text="No equipment assigned yet." />
          ) : (
            <div className="-mx-5 -mt-5 mb-1 divide-y divide-border">
              {eventEquipment.map((eq) => {
                const insufficient = Number(eq.quantity_needed) > Number(eq.equipment?.total_quantity ?? 0);
                return (
                  <div key={eq.id} className="flex items-center justify-between px-5 py-2.5 text-[13px]">
                    <div>
                      <span className="font-semibold text-text">{eq.equipment?.name}</span>
                      <span className="ml-2 text-text-muted">
                        {eq.quantity_needed} needed of {eq.equipment?.total_quantity} {eq.equipment?.unit ?? ""} owned
                      </span>
                      {insufficient && <StatusBadge tone="danger">Insufficient</StatusBadge>}
                    </div>
                    <RemoveAssignmentButton kind="equipment" assignmentId={eq.id} eventId={id} />
                  </div>
                );
              })}
            </div>
          )}
          <EquipmentAssignForm companyId={event.company_id} eventId={id} equipment={companyEquipment} />
        </div>
      </SectionCard>

      <SectionCard title="Delivery">
        <DeliveryForm
          companyId={event.company_id}
          eventId={id}
          vehicles={vehicles}
          deliveryPersons={deliveryPersons}
          initial={delivery ? { scheduled_time: delivery.scheduled_time, vehicle_id: delivery.vehicle_id, driver_id: delivery.driver_id, delivery_vendor_id: delivery.delivery_vendor_id, notes: delivery.notes } : null}
        />
      </SectionCard>
    </div>
  );
}
