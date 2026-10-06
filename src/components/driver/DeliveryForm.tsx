"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createDelivery, updateDeliveryDetails, type DeliveryInput } from "@/lib/driver/actions";
import { decodeAssignee, encodeAssignee, type DeliveryPerson } from "@/lib/driver/deliveryPersons";
import { DeliveryPersonSelect } from "@/components/driver/DeliveryPersonSelect";
import { formatMalaysiaDateTime } from "@/lib/format";

type Company = { id: string; name: string };
type Event = { id: string; event_name: string; company_id: string };
type Vehicle = { id: string; plate_number: string; company_id: string };

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

export function DeliveryForm({
  companies,
  defaultCompanyId,
  events,
  vehicles,
  deliveryPersons,
  deliveryId,
  initial,
  scheduledTime,
}: {
  companies: Company[];
  defaultCompanyId?: string;
  events: Event[];
  vehicles: Vehicle[];
  deliveryPersons: DeliveryPerson[];
  deliveryId?: string;
  initial?: Partial<DeliveryInput>;
  /** The system-generated creation timestamp (existing deliveries only). */
  scheduledTime?: string | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(initial?.companyId ?? defaultCompanyId ?? companies[0]?.id ?? "");
  const [form, setForm] = useState({
    cateringEventId: initial?.cateringEventId ?? "",
    location: initial?.location ?? "",
    itemsDescription: initial?.itemsDescription ?? "",
    vehicleId: initial?.vehicleId ?? "",
    assignee: encodeAssignee(initial?.driverId, initial?.vendorId),
    notes: initial?.notes ?? "",
  });

  const eventsForCompany = events.filter((e) => e.company_id === companyId);
  const vehiclesForCompany = vehicles.filter((v) => v.company_id === companyId);
  const personsForCompany = deliveryPersons.filter((p) => p.companyId === companyId);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload: DeliveryInput = {
      companyId,
      cateringEventId: form.cateringEventId || undefined,
      location: form.location || undefined,
      itemsDescription: form.itemsDescription || undefined,
      vehicleId: form.vehicleId || undefined,
      ...decodeAssignee(form.assignee),
      notes: form.notes || undefined,
    };
    try {
      if (deliveryId) {
        await updateDeliveryDetails(deliveryId, payload);
        router.push(`/driver-logistics/${deliveryId}`);
      } else {
        const created = await createDelivery(payload);
        router.push(`/driver-logistics/${created.id}`);
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
          <select required value={companyId} disabled={!!deliveryId} onChange={(e) => { setCompanyId(e.target.value); set("cateringEventId", ""); set("vehicleId", ""); set("assignee", ""); }} className={inputClass}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Catering Event</label>
          <select value={form.cateringEventId} disabled={!!deliveryId} onChange={(e) => set("cateringEventId", e.target.value)} className={inputClass}>
            <option value="">Not linked to an event</option>
            {eventsForCompany.map((ev) => <option key={ev.id} value={ev.id}>{ev.event_name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Scheduled Time</label>
          <div className="mt-1.5 flex h-10 w-full items-center rounded-lg border border-border bg-bg px-3 text-sm text-text-secondary" aria-readonly="true">
            {scheduledTime ? `${formatMalaysiaDateTime(scheduledTime)} (Malaysia time)` : "Recorded automatically when you create the delivery"}
          </div>
        </div>
        <div>
          <label className={labelClass}>Location</label>
          <input value={form.location} onChange={(e) => set("location", e.target.value)} className={inputClass} placeholder="Delivery address" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Vehicle</label>
          <select value={form.vehicleId} onChange={(e) => set("vehicleId", e.target.value)} className={inputClass}>
            <option value="">Not assigned yet</option>
            {vehiclesForCompany.map((v) => <option key={v.id} value={v.id}>{v.plate_number}</option>)}
          </select>
        </div>
        <DeliveryPersonSelect
          value={form.assignee}
          onChange={(v) => set("assignee", v)}
          persons={personsForCompany}
          className={inputClass}
          labelClassName={labelClass}
        />
      </div>

      <div>
        <label className={labelClass}>Items</label>
        <textarea value={form.itemsDescription} onChange={(e) => set("itemsDescription", e.target.value)} className="mt-1.5 h-16 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none" placeholder="What's being delivered" />
      </div>

      <div>
        <label className={labelClass}>Notes</label>
        <input value={form.notes} onChange={(e) => set("notes", e.target.value)} className={inputClass} placeholder="Access instructions, load-in time, etc." />
      </div>

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : deliveryId ? "Save Changes" : "Create Delivery"}
        </button>
      </div>
    </form>
  );
}
