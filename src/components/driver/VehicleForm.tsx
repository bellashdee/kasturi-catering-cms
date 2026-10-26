"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createVehicle, updateVehicle, type VehicleInput } from "@/lib/driver/actions";
import { Select } from "@/components/ui/Select";

type Company = { id: string; name: string };

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

export function VehicleForm({
  companies,
  defaultCompanyId,
  vehicleId,
  initial,
}: {
  companies: Company[];
  defaultCompanyId?: string;
  vehicleId?: string;
  initial?: Partial<VehicleInput>;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(initial?.companyId ?? defaultCompanyId ?? companies[0]?.id ?? "");
  const [form, setForm] = useState({
    plateNumber: initial?.plateNumber ?? "",
    vehicleType: initial?.vehicleType ?? "",
    status: initial?.status ?? "active",
    insuranceExpiry: initial?.insuranceExpiry ?? "",
    roadTaxExpiry: initial?.roadTaxExpiry ?? "",
    nextMaintenanceDue: initial?.nextMaintenanceDue ?? "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload: VehicleInput = { companyId, ...form };
    try {
      if (vehicleId) {
        await updateVehicle(vehicleId, payload);
        router.push(`/driver-logistics/vehicles/${vehicleId}`);
      } else {
        const created = await createVehicle(payload);
        router.push(`/driver-logistics/vehicles/${created.id}`);
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
          <Select required value={companyId} onChange={(e) => setCompanyId(e.target.value)} disabled={!!vehicleId} className={inputClass}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div>
          <label className={labelClass}>Plate Number *</label>
          <input required value={form.plateNumber} onChange={(e) => setForm((f) => ({ ...f, plateNumber: e.target.value }))} className={inputClass} placeholder="e.g. WXX 1234" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Vehicle Type</label>
          <input value={form.vehicleType} onChange={(e) => setForm((f) => ({ ...f, vehicleType: e.target.value }))} className={inputClass} placeholder="e.g. Van, Lorry, Car" />
        </div>
        <div>
          <label className={labelClass}>Status</label>
          <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={inputClass}>
            <option value="active">Active</option>
            <option value="maintenance">In Maintenance</option>
            <option value="inactive">Inactive</option>
            <option value="retired">Retired</option>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Insurance Expiry</label>
          <input type="date" value={form.insuranceExpiry} onChange={(e) => setForm((f) => ({ ...f, insuranceExpiry: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Road Tax Expiry</label>
          <input type="date" value={form.roadTaxExpiry} onChange={(e) => setForm((f) => ({ ...f, roadTaxExpiry: e.target.value }))} className={inputClass} />
        </div>
      </div>

      {!vehicleId && (
        <div>
          <label className={labelClass}>Next Maintenance Due</label>
          <input type="date" value={form.nextMaintenanceDue} onChange={(e) => setForm((f) => ({ ...f, nextMaintenanceDue: e.target.value }))} className={inputClass} />
          <p className="mt-1 text-xs text-text-muted">This updates automatically once you log a service record.</p>
        </div>
      )}

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving || !form.plateNumber.trim()} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : vehicleId ? "Save Changes" : "Add Vehicle"}
        </button>
      </div>
    </form>
  );
}
