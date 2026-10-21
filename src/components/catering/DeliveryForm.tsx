"use client";

import { vehicleLabel } from "@/lib/driver/constants";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { upsertDelivery } from "@/lib/catering/actions";
import { decodeAssignee, encodeAssignee, type DeliveryPerson } from "@/lib/driver/deliveryPersons";
import { DeliveryPersonSelect } from "@/components/driver/DeliveryPersonSelect";
import { formatMalaysiaDateTime } from "@/lib/format";

type Vehicle = { id: string; plate_number: string; vehicle_type?: string | null };

export function DeliveryForm({
  companyId,
  eventId,
  vehicles,
  deliveryPersons,
  initial,
  deliveryId,
  dayId,
}: {
  companyId: string;
  eventId: string;
  /** The delivery being edited (multi-day events have one per day). */
  deliveryId?: string;
  /** The event day, when its delivery has not been created yet. */
  dayId?: string;
  vehicles: Vehicle[];
  deliveryPersons: DeliveryPerson[];
  initial: { scheduled_time: string | null; vehicle_id: string | null; driver_id: string | null; delivery_vendor_id: string | null; notes: string | null } | null;
}) {
  const router = useRouter();
  const [vehicleId, setVehicleId] = useState(initial?.vehicle_id ?? "");
  const [assignee, setAssignee] = useState(encodeAssignee(initial?.driver_id, initial?.delivery_vendor_id));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await upsertDelivery({
        companyId,
        eventId,
        deliveryId,
        dayId,
        vehicleId: vehicleId || undefined,
        ...decodeAssignee(assignee),
        notes: notes || undefined,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">{error}</div>}

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Scheduled Time</label>
          <div className="mt-1 flex h-9 w-full items-center rounded-lg border border-border bg-bg px-2 text-[12.5px] text-text-secondary" aria-readonly="true">
            {initial?.scheduled_time ? `${formatMalaysiaDateTime(initial.scheduled_time)} (Malaysia time)` : dayId ? "Set from the day's date and time on save" : "Recorded automatically on save"}
          </div>
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Vehicle Required</label>
          <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]">
            <option value="">Not assigned yet</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}
          </select>
        </div>
        <DeliveryPersonSelect
          value={assignee}
          onChange={setAssignee}
          persons={deliveryPersons}
          className="mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]"
          labelClassName="text-[12px] font-semibold text-text-secondary"
        />
      </div>

      <div>
        <label className="text-[12px] font-semibold text-text-secondary">Delivery Notes</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]" placeholder="Access instructions, load-in time, etc." />
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Save Delivery Details"}
        </button>
      </div>
    </form>
  );
}
