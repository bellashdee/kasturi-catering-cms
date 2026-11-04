import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { StatusBadge } from "@/components/StatusBadge";
import { EVENT_TYPE_LABEL, MEAL_TYPE_LABEL, SERVICE_TYPE_LABEL } from "@/lib/catering/constants";
import { dayAmount, dayMainAmount, daySecondMenusAmount, dayPax, menuRows, secondMenuAmount, secondMenusOf, type EventDay } from "@/lib/catering/days";
import {
  ATTACHMENT_BUCKET,
  REQUIREMENT_FIELDS,
  TRACKING_STATUS_LABEL,
  TRACKING_STATUS_TONE,
  additionalRows,
  additionalServiceLines,
  type AdditionalServices,
  type ExtraItem,
  type RequestRequirements,
} from "@/lib/catering/quotationRequest";
import { formatCurrency, formatMalaysiaDate, formatMalaysiaDateTime, formatPrice, formatTime12 } from "@/lib/format";
import { RequestNotes, RequestTrackingForm } from "@/components/catering/QuotationRequestInbox";

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
  const extras = (r.extra_items as unknown as ExtraItem[]) ?? [];
  const additional = additionalRows(r.additional as AdditionalServices | null, extras);
  // the extra items the agent typed in (the additional requirement lines are listed above them)
  const additionalNames = new Set(additionalServiceLines((r.additional as AdditionalServices | null) ?? undefined).map((l) => l.itemName));
  const otherExtras = extras.filter((i) => !additionalNames.has(i.itemName));
  const total = days.reduce((t, d) => t + dayAmount(d), 0) + extras.reduce((t, i) => t + i.quantity * i.unitPrice, 0);
  const handlers = (people ?? []).map((p) => ({ id: p.user_id, name: p.full_name ?? "—" }));
  const { data: { user } } = await supabase.auth.getUser();
  const requirements = (r.requirements as RequestRequirements | null) ?? {};
  const writtenRequirements = REQUIREMENT_FIELDS.filter((f) => requirements[f.key]);
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
        {r.catering_event_id && (
          <p className="mt-1 text-[12.5px] text-text-muted">
            An event was made from this request before the inbox was introduced: <Link href={`/catering/${r.catering_event_id}${query}`} className="font-semibold text-primary">open the event</Link>
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-5">
          <section className={card}>
            <div className={heading}>Customer &amp; event</div>
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
                  <dd className="font-semibold text-text">{value || "—"}</dd>
                </div>
              ))}
            </dl>
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
                  {secondMenusOf(d).map((m, n) => (
                    <div key={n} className="mt-2 rounded border border-border bg-surface px-3 py-2">
                      <div className="font-semibold text-text">Second menu {n + 1} <span className="text-xs font-normal text-text-muted">(included in the total)</span></div>
                      <div className="text-text-secondary">
                        {m.mealTypes.map((t) => MEAL_TYPE_LABEL[t] ?? t).join(", ") || "no meal type"} · {SERVICE_TYPE_LABEL[m.serviceType] ?? m.serviceType} · {m.pax ?? "—"} pax
                        {m.pricePerMeal !== undefined ? ` · ${formatPrice(m.pricePerMeal)} / meal = ${formatPrice(secondMenuAmount(m))}` : ""}
                      </div>
                      <div className="whitespace-pre-line text-xs text-text-muted">{m.menu}</div>
                    </div>
                  ))}
                  {daySecondMenusAmount(d) > 0 && <div className="mt-1 text-xs font-semibold text-text">Day total (main menu + second menus): {formatPrice(dayAmount(d))}</div>}
                  {d.remarks && <div className="mt-1 whitespace-pre-line text-xs text-text-muted">Remarks: {d.remarks}</div>}
                </div>
              ))}
            </div>
          </section>

          {(requirements.menuOptions || writtenRequirements.length > 0) && (
            <section className={card}>
              <div className={heading}>Menu &amp; catering requirements</div>
              <dl className="flex flex-col gap-2 text-[13px]">
                {requirements.menuOptions && (
                  <div>
                    <dt className="text-[11.5px] font-semibold text-text-muted">Number of menu options</dt>
                    <dd className="font-semibold text-text">{requirements.menuOptions}</dd>
                  </div>
                )}
                {writtenRequirements.map((f) => (
                  <div key={f.key}>
                    <dt className="text-[11.5px] font-semibold text-text-muted">{f.label}</dt>
                    <dd className="whitespace-pre-line text-text">{requirements[f.key]}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

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

          <section className={card}>
            <div className={heading}>Additional requirement &amp; set-up</div>
            <div className="flex flex-col gap-1 text-[13px]">
              {additional.map((a) => (
                <div key={a.label} className="flex gap-2">
                  <span className="w-56 font-semibold text-text">{a.label}</span>
                  <span className="text-text-secondary">{a.yes ? `Yes${a.detail ? ` · ${a.detail}` : ""}` : "No"}</span>
                </div>
              ))}
              {otherExtras.length > 0 && (
                <div className="mt-2 text-text-secondary">
                  <span className="font-semibold text-text">Extra items:</span> {otherExtras.map((i) => `${i.itemName} (${i.quantity} × ${formatPrice(i.unitPrice)})`).join("; ")}
                </div>
              )}
              {r.kitchen_setup && <div className="mt-2 whitespace-pre-line text-text-secondary"><span className="font-semibold text-text">Kitchen set-up:</span> {r.kitchen_setup}</div>}
              {r.catering_setup && <div className="whitespace-pre-line text-text-secondary"><span className="font-semibold text-text">Catering set-up:</span> {r.catering_setup}</div>}
              {r.remarks && <div className="whitespace-pre-line text-text-secondary"><span className="font-semibold text-text">Remarks:</span> {r.remarks}</div>}
            </div>
          </section>
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

          <section className={card}>
            <div className={heading}>History</div>
            {(history ?? []).length === 0 ? (
              <p className="text-[12.5px] text-text-muted">No changes yet.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-[12.5px]">
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
          </section>
        </div>
      </div>
    </div>
  );
}
