"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createDateOnlyEvent, type DateOnlyDuplicate } from "@/lib/catering/dateOnlyActions";
import { EVENT_STATUS_LABEL, JDT_EVENT_TYPE, eventTypeOptions } from "@/lib/catering/constants";
import { TimeInput12 } from "@/components/ui/TimeInput12";
import { Select } from "@/components/ui/Select";

const input = "mt-1 h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-[14px] outline-none focus:border-primary";
const label = "text-[12.5px] font-semibold text-text-secondary";

const empty = () => ({ eventType: JDT_EVENT_TYPE, eventName: "JDT Match", matchDetails: "", date: "", time: "", venue: "", status: "date_confirmed", remarks: "" });

/**
 * "+ Date only (JDT)": saves a Signature Solution event with just its date (e.g. a JDT match confirmed before the menu and pax).
 * The menu, pax, budget and costing are filled in later on the same event (Edit), so the event is never made twice.
 */
export function DateOnlyEventButton({ query }: { query: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dupes, setDupes] = useState<DateOnlyDuplicate[] | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const set = (k: keyof ReturnType<typeof empty>, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save(allowSameDay: boolean) {
    setBusy(true);
    setError(null);
    const r = await createDateOnlyEvent({ ...form }, allowSameDay);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    if (r.duplicates?.length) return setDupes(r.duplicates);
    setDupes(null);
    setSaved(`${form.date}`);
    setForm((f) => ({ ...empty(), eventType: f.eventType, eventName: f.eventName, venue: f.venue }));
    router.refresh();
  }

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-blue-600 bg-blue-50 px-3 py-2 text-[13px] font-bold text-blue-800 hover:bg-blue-100">
        + Date only (JDT match)
      </button>
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
      className="w-full rounded-xl border-l-[4px] border-blue-600 bg-blue-50 p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[15px] font-extrabold text-text">Add a date only — Signature Solution</div>
          <div className="text-[12.5px] text-text-secondary">For a JDT match (or another event) whose date is confirmed before the menu and pax. Menu, pax, budget and costing are added later with Edit on the same event.</div>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="text-[13px] font-semibold text-text-secondary hover:underline">
          Close
        </button>
      </div>

      {saved && <div className="mt-2 rounded-lg bg-success-bg px-3 py-2 text-[13px] font-semibold text-success">{`Saved on ${saved}. It is on the calendar now. Add the next one, or Close.`}</div>}

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={label}>Event category *</label>
          <Select required value={form.eventType} onChange={(e) => set("eventType", e.target.value)} className={input}>
            {eventTypeOptions(form.eventType).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className={label}>Event name *</label>
          <input required value={form.eventName} onChange={(e) => set("eventName", e.target.value)} className={input} />
        </div>
        <div>
          <label className={label}>Event status *</label>
          <Select required value={form.status} onChange={(e) => set("status", e.target.value)} className={input}>
            <option value="date_confirmed">{EVENT_STATUS_LABEL.date_confirmed} (menu & pax pending)</option>
            <option value="details_pending">{EVENT_STATUS_LABEL.details_pending} (waiting for menu & pax)</option>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <label className={label}>{form.eventType === JDT_EVENT_TYPE ? "Match details" : "Details"}</label>
          <input value={form.matchDetails} onChange={(e) => set("matchDetails", e.target.value)} className={input} placeholder="e.g. JDT FC vs KL CITY FC (Liga Super)" />
        </div>
        <div>
          <label className={label}>{form.eventType === JDT_EVENT_TYPE ? "Match date *" : "Event date *"}</label>
          <input required type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className={input} />
        </div>
        <div>
          <label className={label}>{form.eventType === JDT_EVENT_TYPE ? "Kick-off time" : "Event time"}</label>
          <TimeInput12 value={form.time} onChange={(v) => set("time", v)} fieldClass={input} className="!mt-1" ariaLabel="Kick-off time" />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Venue</label>
          <input value={form.venue} onChange={(e) => set("venue", e.target.value)} className={input} placeholder="e.g. Stadium Sultan Ibrahim (SSI)" />
        </div>
        <div className="sm:col-span-3">
          <label className={label}>Remarks</label>
          <textarea value={form.remarks} onChange={(e) => set("remarks", e.target.value)} className={`${input} h-16 resize-none py-2`} />
        </div>
      </div>

      {dupes && (
        <div className="mt-3 rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-[13px] text-text">
          <b>A JDT event is already on this date:</b>
          <ul className="mt-1 list-disc pl-5">
            {dupes.map((d) => (
              <li key={d.id}>
                <Link href={`/catering/${d.id}${query}`} className="font-semibold text-primary hover:underline">{d.name}</Link> · {EVENT_STATUS_LABEL[d.status] ?? d.status}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => setDupes(null)} className="h-9 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-semibold">
              Don&apos;t save (use the one above)
            </button>
            <button type="button" disabled={busy} onClick={() => void save(true)} className="h-9 rounded-lg bg-primary px-3 text-[13px] font-semibold text-white">
              It is a different match — save it too
            </button>
          </div>
        </div>
      )}

      {error && <div className="mt-2 text-[13px] font-semibold text-danger">{error}</div>}
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={busy} className="h-10 rounded-lg bg-blue-700 px-4 text-[14px] font-semibold text-white disabled:opacity-60">
          {busy ? "Saving..." : "Save date"}
        </button>
      </div>
    </form>
  );
}
