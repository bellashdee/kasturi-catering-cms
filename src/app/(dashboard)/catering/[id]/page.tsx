import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import {
  getEvent,
  listEventDays,
  listQuotationsForEvent,
  getCosting,
  listStaffForEvent,
  listEquipmentForEvent,
  listEquipmentForCompanies,
  listDeliveriesForEvent,
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
import { formatCurrency, formatPrice } from "@/lib/format";
import { dayAmount, dayPax, menuRows } from "@/lib/catering/days";
import { additionalRows, type AdditionalServices, type ExtraItem } from "@/lib/catering/quotationRequest";
import { toEventDays } from "@/lib/catering/queries";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionCard, EmptyRow } from "@/components/dashboard/SectionCard";
import { EventStatusSelect } from "@/components/catering/EventStatusSelect";
import { QuotationActions } from "@/components/catering/QuotationActions";
import { EventDeleteAction, QuotationRecordActions } from "@/components/catering/CateringRecordActions";
import { CostingForm } from "@/components/catering/CostingForm";
import { StaffAssignForm } from "@/components/catering/StaffAssignForm";
import { EquipmentAssignForm } from "@/components/catering/EquipmentAssignForm";
import { DeliveryForm } from "@/components/catering/DeliveryForm";
import { listDeliveryPersons } from "@/lib/driver/queries";
import { DELIVERY_STATUS_LABEL } from "@/lib/driver/constants";
import { RemoveAssignmentButton } from "@/components/catering/RemoveAssignmentButton";

/** A menu as numbered points, one menu item on each line (a "-", "•" or "1." typed in front of an item is not repeated). */
function MenuPoints({ text, className = "" }: { text: string; className?: string }) {
  return (
    <ol className={`list-decimal space-y-0.5 pl-5 ${className}`}>
      {menuRows(text).map((item, i) => (
        <li key={i}>{item.replace(/^(?:[-–•*]|\d+[.)])\s+/, "")}</li>
      ))}
    </ol>
  );
}

function toDeliveryInitial(d: { scheduled_time: string | null; vehicle_id: string | null; driver_id: string | null; delivery_vendor_id: string | null; notes: string | null }) {
  return { scheduled_time: d.scheduled_time, vehicle_id: d.vehicle_id, driver_id: d.driver_id, delivery_vendor_id: d.delivery_vendor_id, notes: d.notes };
}

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

  // an event made from a sales agent's quotation request shows what the agent ticked under "Additional requirement"
  const { data: fromRequest } = await supabase.from("quotation_requests").select("sales_agent, additional, extra_items").eq("catering_event_id", id).maybeSingle();
  const additional = fromRequest ? additionalRows(fromRequest.additional as AdditionalServices | null, (fromRequest.extra_items ?? []) as unknown as ExtraItem[]) : [];

  const dayRowsData = await listEventDays(supabase, id);
  const eventDays = toEventDays(dayRowsData);
  const [quotations, costing, staff, eventEquipment, companyEquipment, deliveries, employeesRes, vehiclesRes] = await Promise.all([
    listQuotationsForEvent(supabase, id),
    getCosting(supabase, id),
    listStaffForEvent(supabase, id),
    listEquipmentForEvent(supabase, id),
    listEquipmentForCompanies(supabase, [event.company_id]),
    listDeliveriesForEvent(supabase, id),
    supabase.from("employees").select("id, full_name").eq("company_id", event.company_id).eq("status", "active").order("full_name"),
    supabase.from("vehicles").select("id, plate_number, vehicle_type").eq("company_id", event.company_id).order("plate_number"),
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
            {event.end_date ? ` → ${event.end_date} (${eventDays.length || "multi"} days)` : event.event_time ? ` ${event.event_time.slice(0, 5)}` : ""}
            {event.location && ` · ${event.location}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <EventStatusSelect eventId={id} status={event.status} />
          <Link href={`/ai-assistant?event=${id}`} className="rounded-lg border border-primary bg-surface px-4 py-2 text-[13px] font-semibold text-primary">
            Ingredients (AI Assistant)
          </Link>
          <Link href={`/catering/${id}/edit${query}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-[13px] font-semibold text-text">
            Edit
          </Link>
          <EventDeleteAction eventId={id} name={event.event_name} listHref={`/catering${query}`} />
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

      {(event.pic_name || event.pic_phone || event.sales_agent || event.setup_time || event.event_time || event.price_per_pax !== null) && (
        <div className="grid grid-cols-4 gap-4">
          {(event.pic_name || event.pic_phone) && (
            <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">PIC</div>
              <div className="mt-1 text-[14px] font-bold text-text">{event.pic_name ?? "—"}</div>
              <div className="text-xs text-text-secondary">{event.pic_phone ?? ""}</div>
            </div>
          )}
          {event.sales_agent && (
            <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Sales agent</div>
              <div className="mt-1 text-[14px] font-bold text-text">{event.sales_agent}</div>
            </div>
          )}
          {event.setup_time && (
            <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Set-up time (kitchen side)</div>
              <div className="mt-1 text-[14px] font-bold text-text">{event.setup_time.slice(0, 5)}</div>
            </div>
          )}
          {event.event_time && (
            <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Event time</div>
              <div className="mt-1 text-[14px] font-bold text-text">{event.event_time.slice(0, 5)}</div>
            </div>
          )}
          {event.price_per_pax !== null && (
            <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Price per pax</div>
              <div className="mt-1 text-[14px] font-bold text-text">{formatPrice(event.price_per_pax)}</div>
            </div>
          )}
        </div>
      )}

      {eventDays.length > 0 && (
        <SectionCard title={`Event days (${eventDays.length})`}>
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {eventDays.map((d, i) => (
              <div key={d.dayDate} className="px-5 py-3 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-text">Day {i + 1} · {d.dayDate}</span>
                  <span className="text-text-muted">
                    {d.setupTime ? `Set-up (kitchen) ${d.setupTime}` : ""}{d.setupTime && d.eventTime ? " · " : ""}{d.eventTime ? `Event ${d.eventTime}` : ""}
                  </span>
                  {d.mealTypes.map((m) => <StatusBadge key={m} tone="info">{MEAL_TYPE_LABEL[m] ?? m}</StatusBadge>)}
                  <StatusBadge tone="success">{SERVICE_TYPE_LABEL[d.serviceType] ?? d.serviceType} · {d.servicePax} pax</StatusBadge>
                  {d.secondServiceType && <StatusBadge tone="neutral">{SERVICE_TYPE_LABEL[d.secondServiceType] ?? d.secondServiceType} · {d.secondServicePax} pax</StatusBadge>}
                  <span className="ml-auto font-semibold text-text">
                    {dayPax(d)} pax{d.pricePerPax ? ` × ${formatPrice(d.pricePerPax)} = ${formatPrice(dayAmount(d))}` : ""}
                  </span>
                </div>
                {d.menuDetails && <MenuPoints text={d.menuDetails} className="mt-1 text-text-secondary" />}
                {d.remarks && <div className="mt-1 whitespace-pre-line text-xs text-text-muted">Remarks: {d.remarks}</div>}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {additional.length > 0 && (
        <SectionCard title="Additional requirement">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {additional.map((a) => (
              <div key={a.label} className="rounded-lg border border-border bg-surface-alt px-4 py-3">
                <div className="text-[12px] font-bold uppercase tracking-wide text-text-muted">{a.label}</div>
                <div className="mt-1 flex items-center gap-2">
                  <StatusBadge tone={a.yes ? "success" : "neutral"}>{a.yes ? "Yes" : "No"}</StatusBadge>
                  {a.detail && <span className="text-[13px] font-semibold text-text">{a.detail}</span>}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {(event.kitchen_setup || event.catering_setup) && (
        <div className="grid grid-cols-2 gap-4">
          {event.kitchen_setup && (
            <div className="whitespace-pre-line rounded-xl border border-border bg-surface p-4 text-[13px] shadow-sm">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">Kitchen set-up</div>
              {event.kitchen_setup}
            </div>
          )}
          {event.catering_setup && (
            <div className="whitespace-pre-line rounded-xl border border-border bg-surface p-4 text-[13px] shadow-sm">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">Catering set-up</div>
              {event.catering_setup}
            </div>
          )}
        </div>
      )}

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
              <MenuPoints text={event.menu_description} />
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
                  <QuotationRecordActions
                    quotation={{ id: q.id, number: q.quotation_number, status: q.status, items: [...(q.quotation_items ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((i) => ({ itemName: i.item_name, quantity: String(i.quantity), unitPrice: String(i.unit_price), discountPercent: String(i.discount_percent) })) }}
                  />
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

      <SectionCard title={eventDays.length > 0 ? `Delivery (${eventDays.length} days)` : "Delivery"}>
        {eventDays.length === 0 ? (
          <DeliveryForm
            companyId={event.company_id}
            eventId={id}
            deliveryId={deliveries[0]?.id}
            vehicles={vehicles}
            deliveryPersons={deliveryPersons}
            initial={deliveries[0] ? toDeliveryInitial(deliveries[0]) : null}
          />
        ) : (
          <div className="flex flex-col gap-5">
            {dayRowsData.map((day, i) => {
              const dayDelivery = deliveries.find((d) => d.catering_event_day_id === day.id);
              return (
                <div key={day.id} className="border-b border-border pb-5 last:border-b-0 last:pb-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="font-bold text-text">Day {i + 1} · {day.day_date}</span>
                    {dayDelivery ? (
                      <StatusBadge tone={dayDelivery.status === "delivered" ? "success" : "neutral"}>{DELIVERY_STATUS_LABEL[dayDelivery.status] ?? dayDelivery.status}</StatusBadge>
                    ) : (
                      <span className="text-xs text-text-muted">No delivery yet — it is created when the event is confirmed, or when you save below.</span>
                    )}
                    {dayDelivery && <Link href={`/driver-logistics/${dayDelivery.id}${query}`} className="ml-auto text-xs font-semibold text-primary">Open delivery</Link>}
                  </div>
                  <DeliveryForm
                    key={dayDelivery?.id ?? day.id}
                    companyId={event.company_id}
                    eventId={id}
                    deliveryId={dayDelivery?.id}
                    dayId={day.id}
                    vehicles={vehicles}
                    deliveryPersons={deliveryPersons}
                    initial={dayDelivery ? toDeliveryInitial(dayDelivery) : null}
                  />
                </div>
              );
            })}
            {deliveries
              .filter((d) => !dayRowsData.some((day) => day.id === d.catering_event_day_id))
              .map((d) => (
                <div key={d.id} className="border-t border-border pt-5">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="font-bold text-text">Other delivery</span>
                    <span className="text-xs text-text-muted">not linked to a day of this event (made before the days were set, or its day was changed)</span>
                    <Link href={`/driver-logistics/${d.id}${query}`} className="ml-auto text-xs font-semibold text-primary">Open delivery</Link>
                  </div>
                  <DeliveryForm key={d.id} companyId={event.company_id} eventId={id} deliveryId={d.id} vehicles={vehicles} deliveryPersons={deliveryPersons} initial={toDeliveryInitial(d)} />
                </div>
              ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
