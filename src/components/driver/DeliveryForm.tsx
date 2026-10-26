"use client";

import { vehicleLabel } from "@/lib/driver/constants";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createDelivery, updateDeliveryDetails, type DeliveryInput } from "@/lib/driver/actions";
import { decodeAssignee, encodeAssignee, type DeliveryPerson } from "@/lib/driver/deliveryPersons";
import { DeliveryPersonSelect } from "@/components/driver/DeliveryPersonSelect";
import { toMalaysiaInputValue } from "@/lib/format";
import { uploadDocument, fileTypeFromMime } from "@/lib/documents/upload";
import { attachTaskProof } from "@/lib/taskProofs/actions";
import { Select } from "@/components/ui/Select";

type Company = { id: string; name: string };
type Event = { id: string; event_name: string; company_id: string };
type Vehicle = { id: string; plate_number: string; vehicle_type?: string | null; company_id: string };

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
  const [saved, setSaved] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(initial?.companyId ?? defaultCompanyId ?? companies[0]?.id ?? "");
  const [form, setForm] = useState({
    cateringEventId: initial?.cateringEventId ?? "",
    location: initial?.location ?? "",
    itemsDescription: initial?.itemsDescription ?? "",
    vehicleId: initial?.vehicleId ?? "",
    assignee: encodeAssignee(initial?.driverId, initial?.vendorId),
    notes: initial?.notes ?? "",
    scheduledTime: toMalaysiaInputValue(scheduledTime ?? new Date()),
  });

  const eventsForCompany = events.filter((e) => e.company_id === companyId);
  const vehiclesForCompany = vehicles.filter((v) => v.company_id === companyId);
  const personsForCompany = deliveryPersons.filter((p) => p.companyId === companyId);

  // an external delivery service (Lalamove ...) is chosen: its booking / receipt can be attached to the delivery
  const vendor = personsForCompany.find((p) => p.value === form.assignee && p.kind === "vendor") ?? null;

  /** Uploads the attached files and keeps them with the delivery (a booking / receipt is not proof of delivery). */
  async function attachFiles(id: string) {
    for (const file of files) {
      const doc = await uploadDocument({ companyId, module: "deliveries", fileType: fileTypeFromMime(file), file });
      await attachTaskProof({ companyId, relatedTable: "deliveries", relatedId: id, documentId: doc.id, proofType: "booking_receipt", remarks: vendor?.label, revalidatePaths: [`/driver-logistics/${id}`] });
    }
  }

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    setCreatedId(null);
    const payload: DeliveryInput = {
      companyId,
      cateringEventId: form.cateringEventId || undefined,
      location: form.location || undefined,
      itemsDescription: form.itemsDescription || undefined,
      vehicleId: form.vehicleId || undefined,
      ...decodeAssignee(form.assignee),
      notes: form.notes || undefined,
      scheduledTime: form.scheduledTime || undefined,
    };
    try {
      if (deliveryId) {
        // the person is already on this delivery's page: stay here, show that it was saved and refresh what the page shows
        await updateDeliveryDetails(deliveryId, payload);
        if (vendor && files.length > 0) {
          try {
            await attachFiles(deliveryId);
            setFiles([]);
          } catch {
            setError("The changes were saved, but the file could not be attached. Please try attaching it again.");
            setSaving(false);
            router.refresh();
            return;
          }
        }
        setSaved(true);
        setSaving(false);
        router.refresh();
        return;
      }
      const created = await createDelivery(payload);
      if (vendor && files.length > 0) {
        try {
          await attachFiles(created.id);
        } catch {
          // the delivery exists: do not create it twice, let the person open it and attach the file there
          setCreatedId(created.id);
          setError("The delivery was created, but the file could not be attached.");
          setSaving(false);
          return;
        }
      }
      router.push(`/driver-logistics/${created.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}
      {createdId && (
        <a href={`/driver-logistics/${createdId}`} className="text-sm font-semibold text-primary hover:underline">
          Open the delivery and attach the file there
        </a>
      )}
      {saved && <div role="status" className="rounded-lg border border-success/30 bg-success-bg px-3 py-2 text-sm text-success">Saved.</div>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Company *</label>
          <Select required value={companyId} disabled={!!deliveryId} onChange={(e) => { setCompanyId(e.target.value); set("cateringEventId", ""); set("vehicleId", ""); set("assignee", ""); }} className={inputClass}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div>
          <label className={labelClass}>Catering Event</label>
          <Select value={form.cateringEventId} disabled={!!deliveryId} onChange={(e) => set("cateringEventId", e.target.value)} className={inputClass}>
            <option value="">Not linked to an event</option>
            {eventsForCompany.map((ev) => <option key={ev.id} value={ev.id}>{ev.event_name}</option>)}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Scheduled Time</label>
          <input type="datetime-local" required value={form.scheduledTime} onChange={(e) => set("scheduledTime", e.target.value)} className={inputClass} />
          <p className="mt-1 text-xs text-text-muted">Malaysia time. You can change it if the schedule changes.</p>
        </div>
        <div>
          <label className={labelClass}>Location</label>
          <input value={form.location} onChange={(e) => set("location", e.target.value)} className={inputClass} placeholder="Delivery address" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Vehicle</label>
          <Select value={form.vehicleId} onChange={(e) => set("vehicleId", e.target.value)} className={inputClass}>
            <option value="">Not assigned yet</option>
            {vehiclesForCompany.map((v) => <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}
          </Select>
        </div>
        <DeliveryPersonSelect
          value={form.assignee}
          onChange={(v) => set("assignee", v)}
          persons={personsForCompany}
          className={inputClass}
          labelClassName={labelClass}
        />
      </div>

      {vendor && (
        <div className="rounded-lg border border-border bg-surface-alt p-3.5">
          <label className={labelClass}>{`Attach the ${vendor.label} booking / receipt (optional)`}</label>
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="mt-1.5 block w-full text-sm"
          />
          <p className="mt-1 text-xs text-text-muted">A screenshot or PDF of the booking, order number or receipt. It stays with this delivery.</p>
          {files.length > 0 && <p className="mt-1 text-xs font-semibold text-text-secondary">{files.map((f) => f.name).join(", ")}</p>}
        </div>
      )}

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
