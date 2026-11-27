import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { StatusBadge } from "@/components/StatusBadge";
import { EVENT_TYPE_LABEL, MEAL_TYPE_LABEL, SERVICE_TYPE_LABEL } from "@/lib/catering/constants";
import { dayAmount, dayMainAmount, daySecondMenusAmount, dayPax, menuRows, secondMenuAmount, secondMenusOf, type EventDay } from "@/lib/catering/days";
import {
  ATTACHMENT_BUCKET,
  TRACKING_STATUS_LABEL,
  TRACKING_STATUS_TONE,
  additionalRows,
  type AdditionalServices,
  type ExtraItem,
  type RequestRequirements,
} from "@/lib/catering/quotationRequest";
import { NEEDS_LABEL, typedExtras } from "@/lib/catering/customerNeeds";
import { CustomerNeedsView } from "@/components/catering/CustomerNeedsView";
import { formatCurrency, formatMalaysiaDate, formatMalaysiaDateTime, formatPrice, formatTime12 } from "@/lib/format";
import { RequestDetailsEditor, RequestNotes, RequestTrackingForm } from "@/components/catering/QuotationRequestInbox";
import { sessionExtrasLines } from "@/lib/catering/quotationRequest";
import { untyped } from "@/lib/kitchenPurchase/shared";
import { isDateOnlyStatus } from "@/lib/catering/constants";

const card = "rounded-xl border border-border bg-surface p-5 shadow-sm";
const heading = "mb-3 text-[13px] font-extrabold uppercase tracking-wide text-text-muted";

export default async function QuotationRequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ company?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("user_has_quotation_request_access");
  if (allowed !== true) notFound();

  const { id } = await params;
  const { company } = await searchParams;
  const query = company ? `?company=${company}` : "";

  const [{ data: r }, { data: notes }, { data: history }, { data: people }, { data: files }] = await Promise.all([
    supabase.from("quotation_requests").select("*, companies(name)").eq("id", id).maybeSingle(),
    supabase.from("quotation_request_notes").select("id, body, created_at, created_by, author:profiles!quotation_request_notes_created_by_fkey(full_name)").eq("request_id", id).order("created_at"),
    supabase.from("quotation_request_history").select("id, field, old_value, new_value, changed_at, author:profiles!quotation_request_history_changed_by_fkey(full_name)").eq("request_id", id).order("changed_at", { ascending: false }).limit(200),
    supabase.rpc("quotation_request_people"),
    supabase.from("quotation_request_files").select("id, storage_path, file_name, size_bytes").eq("request_id", id).order("created_at"),
  ]);
  if (!r) notFound();

  const days = (r.days as unknown as EventDay[]) ?? [];
  // made from a WhatsApp message of the Boss: the original message is kept with the request
  const waId = (r as unknown as { whatsapp_import_id: string | null }).whatsapp_import_id;
  const wa = waId ? ((await untyped(supabase).from("whatsapp_imports").select("id, original_message, imported_at").eq("id", waId).maybeSingle()).data as { id: string; original_message: string; imported_at: string } | null) : null;
  // linked to a JDT date-only event already on the calendar: that event is updated from this request (no second event)
  const linkedEvent = r.catering_event_id ? (await supabase.from("catering_events").select("id, status").eq("id", r.catering_event_id).maybeSingle()).data : null;
  const extras = (r.extra_items as unknown as ExtraItem[]) ?? [];
  const additional = additionalRows(r.additional as AdditionalServices | null, extras);
  // the extra items the agent typed in (the additional requirement lines are listed above them)
  const otherExtras = typedExtras(extras, r.additional as AdditionalServices | null);
  const total = days.reduce((t, d) => t + dayAmount(d), 0) + extras.reduce((t, i) => t + i.quantity * i.unitPrice, 0);
  const handlers = (people ?? []).map((p) => ({ id: p.user_id, name: p.full_name ?? "—" }));
  const { data: { user } } = await supabase.auth.getUser();
  const requirements = (r.requirements as RequestRequirements | null) ?? {};
  // download links last 10 minutes and are made with the viewer's own login, so the bucket's rules (inbox people only) apply
  const attachments = await Promise.all(
    (files ?? []).map(async (f) => {
      const { data: signed } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrl(f.storage_path, 600, { download: f.file_name });
      return { ...f, url: signed?.signedUrl ?? null };
    }),
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/catering/quotation-requests${query}`} className="text-[12.5px] font-semibold text-primary">← Back to the inbox</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-[22px] font-extrabold text-text">{r.request_code ?? "Quotation request"}</h1>
          <StatusBadge tone={TRACKING_STATUS_TONE[r.tracking_status] ?? "neutral"}>{TRACKING_STATUS_LABEL[r.tracking_status] ?? r.tracking_status}</StatusBadge>
        </div>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          {r.event_name} · {r.customer_name} · sent by {r.sales_agent} on {formatMalaysiaDateTime(r.created_at)}
          {r.companies?.name ? ` · ${r.companies.name}` : ""}
        </p>
        {r.catering_event_id && linkedEvent && isDateOnlyStatus(linkedEvent.status) ? (
          <div className="mt-2 rounded-lg border-l-[4px] border-blue-600 bg-blue-50 px-3 py-2 text-[13px] text-text">
            This request is for a JDT date already on the calendar (date only, menu &amp; pax pending). Fill that same event from this request — no second event is made:
            <div className="mt-1.5 flex flex-wrap gap-2">
              <Link href={`/catering/${r.catering_event_id}/edit?fromRequest=${r.id}${company ? `&company=${company}` : ""}`} className="rounded-lg bg-primary px-3 py-1.5 text-[13px] font-semibold text-white">
                Update the JDT event from this request
              </Link>
              <Link href={`/catering/${r.catering_event_id}${query}`} className="rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-[13px] font-semibold text-text">
                Open the event
              </Link>
            </div>
          </div>
        ) : r.catering_event_id ? (
          <p className="mt-1 text-[12.5px] text-text-muted">
            An event was made from this request: <Link href={`/catering/${r.catering_event_id}${query}`} className="font-semibold text-primary">open the event</Link>
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Link href={`/catering/new?fromRequest=${r.id}${company ? `&company=${company}` : ""}`} className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white">
              Create event from this request
            </Link>
            <span className="text-[12px] text-text-muted">Opens New Event filled in with this request. Nothing is saved until you press Create Event.</span>
          </div>
        )}
      </div>

      {wa && (
        <details className="rounded-xl border border-border bg-surface p-4 shadow-sm" open>
          <summary className="cursor-pointer text-[13px] font-extrabold uppercase tracking-wide text-text-muted">{`Original WhatsApp message (imported ${formatMalaysiaDateTime(wa.imported_at)})`}</summary>
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-alt p-3 text-[13px] text-text">{wa.original_message}</pre>
          <Link href={`/catering/quotation-requests/whatsapp?id=${wa.id}${company ? `&company=${company}` : ""}`} className="mt-1 inline-block text-[12.5px] font-semibold text-primary hover:underline">
            See what the AI read and what was edited →
          </Link>
        </details>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-5">
          <section className={card}>
            <div className={heading}>Customer &amp; event</div>
            <RequestDetailsEditor
              requestId={r.id}
              backHref={`/catering/quotation-requests${query}`}
              initial={{
                customerName: r.customer_name ?? "",
                picName: r.pic_name ?? "",
                picPhone: r.pic_phone ?? "",
                contactEmail: r.contact_email ?? "",
                companyAddress: r.company_address ?? "",
                eventName: r.event_name ?? "",
                eventType: r.event_type ?? "",
                location: r.location ?? "",
                eventAddress: r.event_address ?? "",
                salesAgent: r.sales_agent ?? "",
                kitchenSetup: r.kitchen_setup ?? "",
                cateringSetup: r.catering_setup ?? "",
                remarks: r.remarks ?? "",
              }}
            >
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
              {[
                ["Customer / company", r.customer_name],
                ["Event name", r.event_name],
                ["Event type", EVENT_TYPE_LABEL[r.event_type] ?? r.event_type],
                ["Venue", r.location],
                ["Contact person (PIC)", r.pic_name],
                ["Contact number", r.pic_phone],
                ["E-mail", r.contact_email],
                ["Company address", r.company_address],
                ["Event address", r.event_address],
                ["Sales agent", r.sales_agent],
                ["Estimated total", total > 0 ? formatCurrency(total) : "No price given"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[11.5px] font-semibold text-text-muted">{label}</dt>
                  <dd className="whitespace-pre-line font-semibold text-text">{value || "—"}</dd>
                </div>
              ))}
            </dl>
            </RequestDetailsEditor>
          </section>

          <section className={card}>
            <div className={heading}>Event days &amp; menu</div>
            <div className="flex flex-col gap-3">
              {days.map((d, i) => (
                <div key={`${d.dayDate}-${i}`} className="rounded-lg border border-border bg-surface-alt p-3 text-[13px]">
                  <div className="font-bold text-text">
                    Day {i + 1} · {d.dayDate ? formatMalaysiaDate(`${d.dayDate}T00:00:00+08:00`) : "no date"}
                    <span className="ml-2 font-normal text-text-muted">
                      {[
                        d.setupTime ? `Set-up (kitchen) ${formatTime12(d.setupTime)}` : "",
                        d.eventTime ? `Event ${formatTime12(d.eventTime)}${d.endTime ? ` – ${formatTime12(d.endTime)}` : ""}` : "",
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  <div className="text-text-secondary">
                    {d.mealTypes.map((m) => MEAL_TYPE_LABEL[m] ?? m).join(", ") || "no meal type"} · {SERVICE_TYPE_LABEL[d.serviceType] ?? d.serviceType} · {dayPax(d)} pax
                    {d.pricePerPax ? ` · ${formatPrice(d.pricePerPax)} / pax = ${formatPrice(dayMainAmount(d))}` : " · no price"}
                  </div>
                  {menuRows(d.menuDetails).length > 0 && (
                    <ol className="mt-1 list-decimal pl-5 text-text-secondary">
                      {menuRows(d.menuDetails).map((m, n) => <li key={n}>{m}</li>)}
                    </ol>
                  )}
                  {sessionExtrasLines(d).length > 0 && <div className="mt-1 whitespace-pre-line rounded bg-surface px-2 py-1 text-xs font-semibold text-text">{sessionExtrasLines(d).join("\n")}</div>}
                  {secondMenusOf(d).map((m, n) => (
                    <div key={n} className="mt-2 rounded border border-border bg-surface px-3 py-2">
                      <div className="font-semibold text-text">Second menu {n + 1} <span className="text-xs font-normal text-text-muted">(included in the total)</span></div>
                      <div className="text-text-secondary">
                        {m.mealTypes.map((t) => MEAL_TYPE_LABEL[t] ?? t).join(", ") || "no meal type"} · {SERVICE_TYPE_LABEL[m.serviceType] ?? m.serviceType} · {m.pax ?? "—"} pax
                        {m.pricePerMeal !== undefined ? ` · ${formatPrice(m.pricePerMeal)} / meal = ${formatPrice(secondMenuAmount(m))}` : ""}
                      </div>
                      {(m.setupTime || m.eventTime || m.endTime) && (
                        <div className="text-xs text-text-secondary">
                          {[m.setupTime && `Set-up ${formatTime12(m.setupTime)}`, m.eventTime && `Event ${formatTime12(m.eventTime)}`, m.endTime && `Ends ${formatTime12(m.endTime)}`].filter(Boolean).join(" · ")}
                        </div>
                      )}
                      <div className="whitespace-pre-line text-xs text-text-muted">{m.menu}</div>
                      {sessionExtrasLines(m).length > 0 && <div className="mt-1 whitespace-pre-line text-xs font-semibold text-text">{sessionExtrasLines(m).join("\n")}</div>}
                    </div>
                  ))}
                  {daySecondMenusAmount(d) > 0 && <div className="mt-1 text-xs font-semibold text-text">Day total (main menu + second menus): {formatPrice(dayAmount(d))}</div>}
                  {d.remarks && <div className="mt-1 whitespace-pre-line text-xs text-text-muted">Remarks: {d.remarks}</div>}
                </div>
              ))}
            </div>
          </section>

          <section className={card}>
            <div className={heading}>{NEEDS_LABEL.section}</div>
            <CustomerNeedsView
              requirements={requirements}
              additional={additional}
              extras={otherExtras}
              kitchenSetup={r.kitchen_setup}
              cateringSetup={r.catering_setup}
              remarks={r.remarks}
            />
          </section>

          {attachments.length > 0 && (
            <section className={card}>
              <div className={heading}>Attachments</div>
              <ul className="flex flex-col gap-1.5 text-[13px]">
                {attachments.map((f) => (
                  <li key={f.id} className="flex items-center justify-between rounded-lg border border-border bg-surface-alt px-3 py-2">
                    <span className="truncate text-text">
                      {f.file_name}
                      {f.size_bytes ? <span className="ml-1 text-xs text-text-muted">({Math.max(1, Math.round(f.size_bytes / 1024))} KB)</span> : null}
                    </span>
                    {f.url ? (
                      <a href={f.url} className="ml-3 shrink-0 font-semibold text-primary">Download</a>
                    ) : (
                      <span className="ml-3 shrink-0 text-xs text-danger">Not available</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

        </div>

        <div className="flex flex-col gap-5">
          <section className={card}>
            <div className={heading}>Tracking (AutoCount)</div>
            <RequestTrackingForm
              requestId={r.id}
              handlers={handlers}
              initial={{
                trackingStatus: r.tracking_status,
                autocountQuotationNo: r.autocount_quotation_no ?? "",
                autocountInvoiceNo: r.autocount_invoice_no ?? "",
                quotationPreparedOn: r.quotation_prepared_on ?? "",
                sentToCustomerOn: r.sent_to_customer_on ?? "",
                customerResponseOn: r.customer_response_on ?? "",
                followUpOn: r.follow_up_on ?? "",
                handledBy: r.handled_by ?? "",
              }}
            />
          </section>

          <section className={card}>
            <div className={heading}>Internal notes</div>
            <RequestNotes
              requestId={r.id}
              currentUserId={user?.id ?? ""}
              notes={(notes ?? []).map((n) => ({ id: n.id, body: n.body, createdAt: n.created_at, createdBy: n.created_by, author: n.author?.full_name ?? "—" }))}
            />
          </section>

          {/* the audit trail stays closed until the History button is pressed */}
          <details className={`${card} group`}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
              <span className={heading}>History</span>
              <span className="rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-text">
                <span className="group-open:hidden">Show history ({(history ?? []).length})</span>
                <span className="hidden group-open:inline">Hide history</span>
              </span>
            </summary>
            {(history ?? []).length === 0 ? (
              <p className="mt-3 text-[12.5px] text-text-muted">No changes yet.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2 text-[12.5px]">
                {(history ?? []).map((h) => (
                  <li key={h.id} className="border-l-2 border-border pl-3">
                    <div className="text-text">
                      <span className="font-semibold">{h.field}</span>: {h.old_value ?? "—"} → <span className="font-semibold">{h.new_value ?? "—"}</span>
                    </div>
                    <div className="text-[11.5px] text-text-muted">{h.author?.full_name ?? "—"} · {formatMalaysiaDateTime(h.changed_at)}</div>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </div>
      </div>
    </div>
  );
}
