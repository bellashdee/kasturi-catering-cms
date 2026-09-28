"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createEvent, updateEvent, type EventInput } from "@/lib/catering/actions";

type Company = { id: string; name: string };
type Customer = { id: string; name: string; company_id: string };

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

export function EventForm({
  companies,
  defaultCompanyId,
  customers,
  eventId,
  initial,
}: {
  companies: Company[];
  defaultCompanyId?: string;
  customers: Customer[];
  eventId?: string;
  initial?: Partial<EventInput>;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<EventInput>({
    companyId: initial?.companyId ?? defaultCompanyId ?? companies[0]?.id ?? "",
    customerId: initial?.customerId,
    eventName: initial?.eventName ?? "",
    eventDate: initial?.eventDate ?? "",
    eventTime: initial?.eventTime ?? "",
    location: initial?.location ?? "",
    paxCount: initial?.paxCount,
    eventType: initial?.eventType ?? "corporate",
    menuDescription: initial?.menuDescription ?? "",
    specialRequirements: initial?.specialRequirements ?? "",
    status: initial?.status ?? "enquiry",
  });

  const customersForCompany = customers.filter((c) => c.company_id === form.companyId);

  function set<K extends keyof EventInput>(key: K, value: EventInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (eventId) {
        await updateEvent(eventId, form);
        router.push(`/catering/${eventId}`);
      } else {
        const created = await createEvent(form);
        router.push(`/catering/${created.id}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Company *</label>
          <select
            required
            value={form.companyId}
            onChange={(e) => {
              set("companyId", e.target.value);
              set("customerId", undefined);
            }}
            className={inputClass}
          >
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Customer</label>
          <select value={form.customerId ?? ""} onChange={(e) => set("customerId", e.target.value || undefined)} className={inputClass}>
            <option value="">Not linked yet</option>
            {customersForCompany.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>Event Name *</label>
        <input required value={form.eventName} onChange={(e) => set("eventName", e.target.value)} className={inputClass} placeholder="e.g. Menara Corp Annual Dinner" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Date *</label>
          <input type="date" required value={form.eventDate} onChange={(e) => set("eventDate", e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Time</label>
          <input type="time" value={form.eventTime} onChange={(e) => set("eventTime", e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Pax</label>
          <input type="number" min="0" value={form.paxCount ?? ""} onChange={(e) => set("paxCount", e.target.value ? Number(e.target.value) : undefined)} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Location</label>
          <input value={form.location} onChange={(e) => set("location", e.target.value)} className={inputClass} placeholder="Venue / address" />
        </div>
        <div>
          <label className={labelClass}>Event Type</label>
          <select value={form.eventType} onChange={(e) => set("eventType", e.target.value)} className={inputClass}>
            <option value="wedding">Wedding</option>
            <option value="corporate">Corporate</option>
            <option value="birthday">Birthday</option>
            <option value="funeral">Funeral</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      {!eventId && (
        <div>
          <label className={labelClass}>Status</label>
          <select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputClass}>
            <option value="enquiry">Enquiry</option>
            <option value="quoted">Quoted</option>
            <option value="confirmed">Confirmed</option>
          </select>
        </div>
      )}

      <div>
        <label className={labelClass}>Menu</label>
        <textarea value={form.menuDescription} onChange={(e) => set("menuDescription", e.target.value)} className="mt-1.5 h-20 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" placeholder="Menu items or package name" />
      </div>

      <div>
        <label className={labelClass}>Special Requirements</label>
        <textarea value={form.specialRequirements} onChange={(e) => set("specialRequirements", e.target.value)} className="mt-1.5 h-20 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" placeholder="Dietary restrictions, setup needs, etc." />
      </div>

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : eventId ? "Save Changes" : "Create Event"}
        </button>
      </div>
    </form>
  );
}
