"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { errorMessage } from "@/lib/actionResult";
import { approveQuotationRequest, rejectQuotationRequest } from "@/lib/catering/quotationRequestActions";
import { rememberCancelledEvent } from "@/components/catering/CalendarUndoBanner";
import { cancelEventFromCalendar, deleteEventFromCalendar, quickUpdateEvent, restoreEventStatus } from "@/lib/catering/calendarActions";

export type ActionEntry = {
  kind: "event" | "request";
  eventId: string;
  requestId: string | null;
  dayId: string | null;
  status: string;
  eventName: string;
  date: string;
  eventTime: string;
  setupTime: string;
  venue: string | null;
  pax: number;
  twoServices: boolean;
};

const inputClass = "mt-1 h-9 w-full rounded-md border border-border-strong bg-white px-2 text-[13px] outline-none focus:border-primary";
const labelClass = "text-[11.5px] font-semibold text-text-secondary";
const btn = "rounded-md border border-border-strong bg-white px-2.5 py-1 text-[12px] font-semibold text-text hover:border-primary hover:text-primary disabled:opacity-50";

/** Edit (save / cancel), Cancel event (with Undo) and Delete of one calendar entry; Approve / Reject for a quotation request. */
export function CalendarEntryActions({ entry, canDelete, query }: { entry: ActionEntry; canDelete: boolean; query: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ eventName: entry.eventName, date: entry.date, eventTime: entry.eventTime, setupTime: entry.setupTime, location: entry.venue ?? "", pax: entry.pax > 0 ? String(entry.pax) : "" });

  async function run(work: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, after?: (r: Record<string, unknown>) => void) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await work();
      if (!r.ok) {
        setError(r.error ?? "Something went wrong.");
        return;
      }
      after?.(r);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Something went wrong."));
    } finally {
      setBusy(false);
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const pax = form.pax.trim() ? Number(form.pax) : null;
    void run(
      () => quickUpdateEvent({ eventId: entry.eventId, dayId: entry.dayId, eventName: form.eventName, date: form.date, eventTime: form.eventTime, setupTime: form.setupTime, location: form.location, pax }),
      (r) => {
        setEditing(false);
        setNotice((r.notice as string | null) ?? null);
      },
    );
  }

  const fullEdit = `/catering/${entry.eventId}/edit${query}`;

  if (entry.kind === "request") {
    return (
      <div className="mt-2 flex flex-col gap-1.5">
        <div className="flex flex-wrap gap-1.5">
          <button type="button" disabled={busy} onClick={() => void run(() => approveQuotationRequest(entry.requestId!))} className="rounded-md bg-primary px-2.5 py-1 text-[12px] font-semibold text-white disabled:opacity-50">
            Approve &amp; create quotation
          </button>
          <button type="button" disabled={busy} onClick={() => { if (window.confirm(t("Reject this quotation request?"))) void run(() => rejectQuotationRequest(entry.requestId!)); }} className={`${btn} text-danger`}>
            Reject
          </button>
          <Link href={`/catering/quotation-requests${query}`} className={btn}>
            Open request
          </Link>
        </div>
        {error && <div role="alert" className="text-[12px] text-danger">{error}</div>}
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      {!editing && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" disabled={busy} onClick={() => setEditing(true)} className={btn}>
            Edit
          </button>
          {entry.status !== "cancelled" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!window.confirm(t("Cancel this event? It stays in the system as Cancelled and can be restored."))) return;
                void run(() => cancelEventFromCalendar(entry.eventId), (r) => rememberCancelledEvent({ eventId: entry.eventId, eventName: entry.eventName, previousStatus: String(r.previousStatus ?? "enquiry") }));
              }}
              className={`${btn} text-warning`}
            >
              Cancel event
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={() => void run(() => restoreEventStatus(entry.eventId, "enquiry"))} className={btn}>
              Restore event
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!window.confirm(t("Delete this event for good, with its quotations? This cannot be undone. (Cancel it instead if you may need it again.)"))) return;
                void run(() => deleteEventFromCalendar(entry.eventId));
              }}
              className={`${btn} text-danger`}
            >
              Delete
            </button>
          )}
          <Link href={fullEdit} className="text-[12px] font-semibold text-text-secondary hover:underline">
            Full edit
          </Link>
        </div>
      )}

      {editing && (
        <form onSubmit={save} className="rounded-lg border border-border bg-white p-3">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-3">
              <label className={labelClass}>Event name *</label>
              <input required value={form.eventName} onChange={(e) => setForm((f) => ({ ...f, eventName: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Date *</label>
              <input type="date" required value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Set-up time (kitchen) *</label>
              <input type="time" required value={form.setupTime} onChange={(e) => setForm((f) => ({ ...f, setupTime: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Event / food-ready time *</label>
              <input type="time" required value={form.eventTime} onChange={(e) => setForm((f) => ({ ...f, eventTime: e.target.value }))} className={inputClass} />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Venue</label>
              <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Pax</label>
              <input type="number" min={1} value={form.pax} disabled={entry.twoServices} onChange={(e) => setForm((f) => ({ ...f, pax: e.target.value }))} className={`${inputClass} disabled:bg-surface-alt`} />
            </div>
          </div>
          {entry.twoServices && <p className="mt-1.5 text-[11.5px] text-text-muted">This one has two service types, so its pax is changed in the full edit.</p>}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button type="submit" disabled={busy} className="rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-60">
              {busy ? "Saving..." : "Save"}
            </button>
            <button type="button" disabled={busy} onClick={() => { setEditing(false); setError(null); }} className={btn}>
              Cancel
            </button>
            <Link href={fullEdit} className="ml-auto text-[12px] font-semibold text-text-secondary hover:underline">
              Full edit (menu, services, customer)
            </Link>
          </div>
        </form>
      )}

      {notice && <div role="status" className="rounded-md border border-warning/40 bg-warning-bg px-2.5 py-1.5 text-[12px] text-warning">{notice}</div>}
      {error && <div role="alert" className="text-[12px] text-danger">{error}</div>}
    </div>
  );
}
