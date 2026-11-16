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
import { formatCurrency, formatMalaysiaDateTime, formatPrice, formatTime12 } from "@/lib/format";
import { dayAmount, dayPax, menuRows } from "@/lib/catering/days";
import { additionalRows } from "@/lib/catering/quotationRequest";
import { NEEDS_LABEL, eventNeeds } from "@/lib/catering/customerNeeds";
import { CustomerNeedsView } from "@/components/catering/CustomerNeedsView";
import { toEventDays } from "@/lib/catering/queries";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionCard, EmptyRow } from "@/components/dashboard/SectionCard";
import { EventStatusSelect } from "@/components/catering/EventStatusSelect";
import { EventDeleteAction } from "@/components/catering/CateringRecordActions";
import { CostingForm } from "@/components/catering/CostingForm";
import { StaffAssignForm } from "@/components/catering/StaffAssignForm";
import { EquipmentAssignForm } from "@/components/catering/EquipmentAssignForm";
import { DeliveryForm } from "@/components/catering/DeliveryForm";
import { listDeliveryPersons } from "@/lib/driver/queries";
import { DELIVERY_STATUS_LABEL } from "@/lib/driver/constants";
import { RemoveAssignmentButton } from "@/components/catering/RemoveAssignmentButton";
import { EventMenuFromPdf } from "@/components/catering/EventMenuFromPdf";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";

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

  // "What the customer needs": the event's own answers; an older event made from a quotation request reads them from that request
  const { data: fromRequest } = await supabase.from("quotation_requests").select("id, request_code, requirements, additional, extra_items").eq("catering_event_id", id).maybeSingle();
  const needs = eventNeeds(event, fromRequest);
  const answered = needs.additional !== null || !!fromRequest;
  const additional = answered ? additionalRows(needs.additional, needs.allLines) : [];

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

  // Event Profit & Loss (Finance / Admin, and the Quotation Request Inbox people) and who changed the event and when
  const [{ data: canPnl }, { data: auditRows }, { data: menuPdfs }] = await Promise.all([
    supabase.rpc("user_can_manage_event_pnl", { target_company_id: event.company_id }),
    supabase.from("task_audit_log").select("id, action, previous_value, new_value, performed_by, created_at").eq("related_table", "catering_events").eq("related_id", id).order("created_at", { ascending: false }).limit(30),
    // the quotation / invoice PDFs the menu was read from
    supabase.from("documents").select("id, original_filename, uploaded_at").eq("related_table", "catering_events").eq("related_id", id).eq("module", "catering_menu").order("uploaded_at", { ascending: false }),
  ]);
  const editors = Array.from(new Set((auditRows ?? []).map((a) => a.performed_by).filter((x): x is string => !!x)));
  const { data: editorRows } = editors.length ? await supabase.from("profiles").select("id, full_name").in("id", editors) : { data: [] };
  const editorName = new Map((editorRows ?? []).map((p) => [p.id, p.full_name ?? "—"]));
  const AUDIT_ACTION: Record<string, string> = { menu_from_pdf: "Menu read from the quotation / invoice PDF", created: "Created", edited: "Edited", status_changed: "Status changed", imported: "Imported from Excel", import_updated: "Updated by Excel import", calendar_edit: "Edited on the calendar", deleted: "Deleted", restored: "Put back" };

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
          <div className="mt-2 text-[20px] font-extrabold text-text">
            {event.event_name}
            {event.event_reference && <span className="ml-2 text-[13px] font-bold text-text-muted">{event.event_reference}</span>}
          </div>
          <div className="text-[13px] text-text-secondary">
            {event.customers?.name ?? "No customer linked"} · {event.companies?.name} · {event.event_date}
            {event.end_date ? ` → ${event.end_date} (${eventDays.length || "multi"} days)` : event.event_time ? ` ${formatTime12(event.event_time)}${event.end_time ? ` – ${formatTime12(event.end_time)}` : ""}` : ""}
            {event.location && ` · ${event.location}`}
          </div>
          {event.event_address && <div className="text-[12.5px] text-text-muted">{event.event_address}</div>}
        </div>
        <div className="flex items-center gap-2">
          <EventStatusSelect eventId={id} status={event.status} />
          {canPnl === true && (
            <Link href={`/finance/event-pnl/${id}${query}`} className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white">
              Event Profit &amp; Loss
            </Link>
          )}
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

      {(event.autocount_quotation_no || event.autocount_invoice_no) && (
        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">AutoCount quotation no.</div>
            <div className="mt-1 text-[14px] font-bold text-text">{event.autocount_quotation_no ?? "—"}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">AutoCount invoice no.</div>
            <div className="mt-1 text-[14px] font-bold text-text">{event.autocount_invoice_no ?? "—"}</div>
          </div>
        </div>
      )}

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
              <div className="mt-1 text-[14px] font-bold text-text">{formatTime12(event.setup_time)}</div>
            </div>
          )}
          {event.event_time && (
            <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Event time</div>
              <div className="mt-1 text-[14px] font-bold text-text">{formatTime12(event.event_time)}{event.end_time ? ` – ${formatTime12(event.end_time)}` : ""}</div>
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

      <SectionCard title="Menu from the quotation / invoice (PDF)">
        <EventMenuFromPdf
          eventId={id}
          companyId={event.company_id}
          hasEventMenu={!!event.menu_description}
          days={dayRowsData.map((d, i) => ({ id: d.id, date: d.day_date, label: `Day ${i + 1} · ${d.day_date}`, hasMenu: !!d.menu_details }))}
        />
        {(menuPdfs ?? []).length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5 text-[13px]">
            {(menuPdfs ?? []).map((f) => (
              <li key={f.id} className="flex items-center justify-between rounded-lg border border-border bg-surface-alt px-3 py-2">
                <span className="truncate text-text">
                  {f.original_filename}
                  <span className="ml-2 text-xs text-text-muted">uploaded {formatMalaysiaDateTime(f.uploaded_at)}</span>
                </span>
                <DocumentViewLink documentId={f.id} label="View PDF" className="ml-3 shrink-0 font-semibold text-primary" />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {eventDays.length > 0 && (
        <SectionCard title={`Event days (${eventDays.length})`}>
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {eventDays.map((d, i) => (
              <div key={d.dayDate} className="px-5 py-3 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-text">Day {i + 1} · {d.dayDate}</span>
                  <span className="text-text-muted">
                    {d.setupTime ? `Set-up (kitchen) ${formatTime12(d.setupTime)}` : ""}{d.setupTime && d.eventTime ? " · " : ""}{d.eventTime ? `Event ${formatTime12(d.eventTime)}` : ""}
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

      <SectionCard title={NEEDS_LABEL.section}>
        {fromRequest && (
          <p className="-mt-1 mb-3 text-xs text-text-muted">
            Made from quotation request{" "}
            <Link href={`/catering/quotation-requests/${fromRequest.id}${query}`} className="font-semibold text-primary">{fromRequest.request_code ?? "(open)"}</Link>
          </p>
        )}
        <CustomerNeedsView
          requirements={needs.requirements}
          additional={additional}
          extras={needs.extras}
          kitchenSetup={event.kitchen_setup}
          cateringSetup={event.catering_setup}
          remarks={event.remarks}
        />
      </SectionCard>

      {(event.meal_types?.length > 0 || event.service_type) && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          {event.meal_types?.map((m: string) => <StatusBadge key={m} tone="info">{MEAL_TYPE_LABEL[m] ?? m}</StatusBadge>)}
          {event.service_type && <StatusBadge tone="success">{SERVICE_TYPE_LABEL[event.service_type] ?? event.service_type}{event.service_pax ? ` · ${event.service_pax} pax` : ""}</StatusBadge>}
          {event.second_service_type && <StatusBadge tone="neutral">{SERVICE_TYPE_LABEL[event.second_service_type] ?? event.second_service_type}{event.second_service_pax ? ` · ${event.second_service_pax} pax` : ""}</StatusBadge>}
        </div>
      )}

      {/* the remarks are under "What the customer needs" */}
      {event.event_details && (
        <div className="whitespace-pre-line rounded-xl border border-border bg-surface p-4 text-[13px] shadow-sm">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">Event details</div>
          {event.event_details}
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

      {quotations.length > 0 && (
        <SectionCard title="Quotations made in the system (before AutoCount)">
          <p className="-mt-1 mb-3 text-xs text-text-muted">The official quotation and invoice are now made in AutoCount; record their numbers with Edit. These older quotations are kept for reference.</p>
          <div className="-mx-5 -mb-5 divide-y divide-border">
            {quotations.map((q) => (
              <div key={q.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="text-[13px] font-semibold text-text">{q.quotation_number} · {formatCurrency(q.total_amount)}</div>
                  <div className="text-xs text-text-muted">{q.quotation_items?.length ?? 0} item(s) · Payment: {PAYMENT_STATUS_LABEL[q.payment_status] ?? q.payment_status}</div>
                </div>
                <StatusBadge tone={quotationTone(q.status)}>{QUOTATION_STATUS_LABEL[q.status] ?? q.status}</StatusBadge>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

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
      <SectionCard title="Edit history" collapsed={{ count: (auditRows ?? []).length }}>
        {(auditRows ?? []).length === 0 ? (
          <EmptyRow text="No changes recorded yet." />
        ) : (
          <ul className="flex flex-col gap-2 text-[12.5px]">
            {(auditRows ?? []).map((a) => (
              <li key={a.id} className="border-l-2 border-border pl-3">
                <div className="font-semibold text-text">{AUDIT_ACTION[a.action] ?? a.action}</div>
                {a.previous_value && a.new_value && a.previous_value !== a.new_value ? (
                  <div className="text-text-secondary"><span className="text-text-muted line-through">{a.previous_value}</span> → {a.new_value}</div>
                ) : a.new_value ? (
                  <div className="text-text-secondary">{a.new_value}</div>
                ) : null}
                <div className="text-[11.5px] text-text-muted">{(a.performed_by && editorName.get(a.performed_by)) || "—"} · {formatMalaysiaDateTime(a.created_at)}</div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
