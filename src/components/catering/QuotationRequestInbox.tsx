"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { TRACKING_STATUS_LABEL, type TrackingInput } from "@/lib/catering/quotationRequest";
import { addRequestNote, deleteQuotationRequest, deleteRequestNote, updateRequestDetails, updateRequestTracking, type RequestDetailsInput } from "@/lib/catering/quotationRequestInboxActions";
import { ACTIVE_SALES_AGENTS, eventTypeOptions } from "@/lib/catering/constants";
import { formatMalaysiaDateTime } from "@/lib/format";

const inputClass =
  "mt-1 h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-[13px] outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[11.5px] font-semibold text-text-secondary";

/** Status, AutoCount quotation / invoice numbers, the dates and who handles the request. Changing the status never creates an event. */
export function RequestTrackingForm({ requestId, initial, handlers }: { requestId: string; initial: TrackingInput; handlers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [form, setForm] = useState<TrackingInput>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (key: keyof TrackingInput, value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const r = await updateRequestTracking(requestId, form);
    setSaving(false);
    if (!r.ok) setMessage({ ok: false, text: r.error });
    else {
      setMessage({ ok: true, text: "Saved." });
      router.refresh();
    }
  }

  const date = (key: keyof TrackingInput, label: string) => (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input type="date" value={form[key]} onChange={(e) => set(key, e.target.value)} className={inputClass} />
    </label>
  );

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <label className="block">
        <span className={labelClass}>Status</span>
        <Select value={form.trackingStatus} onChange={(e) => set("trackingStatus", e.target.value)} className={inputClass}>
          {Object.entries(TRACKING_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </label>
      <label className="block">
        <span className={labelClass}>Handled by</span>
        <Select value={form.handledBy} onChange={(e) => set("handledBy", e.target.value)} className={inputClass}>
          <option value="">Not assigned</option>
          {handlers.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </Select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClass}>AutoCount quotation no.</span>
          <input maxLength={50} value={form.autocountQuotationNo} onChange={(e) => set("autocountQuotationNo", e.target.value)} className={inputClass} placeholder="As in AutoCount" />
        </label>
        <label className="block">
          <span className={labelClass}>AutoCount invoice no.</span>
          <input maxLength={50} value={form.autocountInvoiceNo} onChange={(e) => set("autocountInvoiceNo", e.target.value)} className={inputClass} placeholder="As in AutoCount" />
        </label>
        {date("quotationPreparedOn", "Quotation prepared on")}
      </div>
      <p className="text-[11.5px] text-text-muted">Customer Confirmed does not create an event: add the confirmed event through the Excel import or New Event.</p>
      {message && <div className={`text-[12.5px] ${message.ok ? "text-success" : "text-danger"}`}>{message.text}</div>}
      <button type="submit" disabled={saving} className="self-start rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">
        {saving ? "Saving..." : "Save tracking"}
      </button>
    </form>
  );
}

type Note = { id: string; body: string; createdAt: string; createdBy: string | null; author: string };

/** Internal notes: only the inbox people (Ms. Nabilah, Mr. Adlan, Ms. Penny) see them; each shows who wrote it. */
export function RequestNotes({ requestId, notes, currentUserId }: { requestId: string; notes: Note[]; currentUserId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(work: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) {
    setBusy(true);
    setError(null);
    const r = await work();
    setBusy(false);
    if (!r.ok) setError(r.error);
    else {
      after?.();
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {notes.length === 0 ? (
        <p className="text-[12.5px] text-text-muted">No notes yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg border border-border bg-surface-alt px-3 py-2 text-[13px]">
              <div className="whitespace-pre-line text-text">{n.body}</div>
              <div className="mt-1 flex items-center justify-between text-[11.5px] text-text-muted">
                <span>{n.author} · {formatMalaysiaDateTime(n.createdAt)}</span>
                {n.createdBy === currentUserId && (
                  <button type="button" disabled={busy} onClick={() => { if (window.confirm("Delete this note?")) void run(() => deleteRequestNote(n.id)); }} className="font-semibold text-danger">
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <textarea value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} className="h-20 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-[13px] outline-none focus:border-primary" placeholder="Internal note (only Nabilah, Adlan and Penny see it)" />
      {error && <div className="text-[12.5px] text-danger">{error}</div>}
      <button type="button" disabled={busy || !text.trim()} onClick={() => void run(() => addRequestNote(requestId, text), () => setText(""))} className="self-start rounded-lg border border-border-strong bg-surface px-4 py-2 text-[13px] font-semibold text-text disabled:opacity-60">
        Add note
      </button>
    </div>
  );
}

const DETAIL_FIELDS: { key: keyof RequestDetailsInput; label: string; long?: boolean }[] = [
  { key: "customerName", label: "Customer / company *" },
  { key: "picName", label: "Contact person (PIC)" },
  { key: "picPhone", label: "Contact number" },
  { key: "contactEmail", label: "E-mail" },
  { key: "companyAddress", label: "Company address", long: true },
  { key: "eventName", label: "Event name *", long: true },
  { key: "location", label: "Venue" },
  { key: "eventAddress", label: "Event address", long: true },
  { key: "kitchenSetup", label: "Kitchen set-up", long: true },
  { key: "cateringSetup", label: "Catering set-up", long: true },
  { key: "remarks", label: "Remarks", long: true },
];

/**
 * The customer and event details of a request with Edit (then Save or Cancel) and Delete. Every saved change goes to the history; Delete
 * removes the request with its notes, history and attachments after a confirmation.
 */
export function RequestDetailsEditor({ requestId, initial, backHref, children }: { requestId: string; initial: RequestDetailsInput; backHref: string; children: React.ReactNode }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<RequestDetailsInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof RequestDetailsInput, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const agents = [...ACTIVE_SALES_AGENTS, ...(initial.salesAgent && !ACTIVE_SALES_AGENTS.includes(initial.salesAgent) ? [initial.salesAgent] : [])];

  async function save() {
    setBusy(true);
    setError(null);
    const r = await updateRequestDetails(requestId, form);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    if (!window.confirm("Delete this quotation request? Its notes, history and attachments are deleted too. This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    const r = await deleteQuotationRequest(requestId);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.push(backHref);
    router.refresh();
  }

  const btn = "rounded-lg border px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-60";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap justify-end gap-2">
        {editing ? (
          <>
            <button type="button" disabled={busy} onClick={() => void save()} className={`${btn} border-primary bg-primary text-white`}>{busy ? "Saving..." : "Save"}</button>
            <button type="button" disabled={busy} onClick={() => { setForm(initial); setEditing(false); setError(null); }} className={`${btn} border-border-strong bg-surface text-text`}>Cancel</button>
          </>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={() => setEditing(true)} className={`${btn} border-border-strong bg-surface text-text`}>Edit</button>
            <button type="button" disabled={busy} onClick={() => void remove()} className={`${btn} border-danger/40 bg-surface text-danger`}>Delete</button>
          </>
        )}
      </div>
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[12.5px] text-danger">{error}</div>}
      {!editing ? (
        children
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {DETAIL_FIELDS.map((f) => (
            <label key={f.key} className={`block ${f.long ? "sm:col-span-2" : ""}`}>
              <span className={labelClass}>{f.label}</span>
              {f.long ? (
                <textarea value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} rows={2} className="mt-1 w-full resize-y rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-primary" />
              ) : (
                <input value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} className={inputClass} />
              )}
            </label>
          ))}
          <label className="block">
            <span className={labelClass}>Event type *</span>
            <Select value={form.eventType} onChange={(e) => set("eventType", e.target.value)} className={inputClass}>
              {eventTypeOptions(initial.eventType).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </label>
          <label className="block">
            <span className={labelClass}>Sales agent</span>
            <Select value={form.salesAgent} onChange={(e) => set("salesAgent", e.target.value)} className={inputClass}>
              <option value="">None</option>
              {agents.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
          </label>
        </div>
      )}
    </div>
  );
}
