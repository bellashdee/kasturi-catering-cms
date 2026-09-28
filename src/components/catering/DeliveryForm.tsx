"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upsertDelivery } from "@/lib/catering/actions";

type Vehicle = { id: string; plate_number: string };
type Employee = { id: string; full_name: string };

function toDatetimeLocal(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 16);
}

export function DeliveryForm({
  companyId,
  eventId,
  vehicles,
  employees,
  initial,
}: {
  companyId: string;
  eventId: string;
  vehicles: Vehicle[];
  employees: Employee[];
  initial: { scheduled_time: string | null; vehicle_id: string | null; driver_id: string | null; notes: string | null } | null;
}) {
  const router = useRouter();
  const [scheduledTime, setScheduledTime] = useState(toDatetimeLocal(initial?.scheduled_time ?? null));
  const [vehicleId, setVehicleId] = useState(initial?.vehicle_id ?? "");
  const [driverId, setDriverId] = useState(initial?.driver_id ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!scheduledTime) {
      setError("Scheduled time is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await upsertDelivery({
        companyId,
        eventId,
        scheduledTime: new Date(scheduledTime).toISOString(),
        vehicleId: vehicleId || undefined,
        driverId: driverId || undefined,
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
          <label className="text-[12px] font-semibold text-text-secondary">Scheduled Time *</label>
          <input type="datetime-local" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]" />
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Vehicle Required</label>
          <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]">
            <option value="">Not assigned yet</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate_number}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Driver Required</label>
          <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]">
            <option value="">Not assigned yet</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        </div>
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
