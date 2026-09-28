"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateDriver } from "@/lib/driver/actions";

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

export function DriverProfileForm({
  driverId,
  initial,
}: {
  driverId: string;
  initial: { license_number: string | null; license_expiry: string | null; notes: string | null };
}) {
  const router = useRouter();
  const [licenseNumber, setLicenseNumber] = useState(initial.license_number ?? "");
  const [licenseExpiry, setLicenseExpiry] = useState(initial.license_expiry ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateDriver(driverId, { licenseNumber: licenseNumber || undefined, licenseExpiry: licenseExpiry || undefined, notes: notes || undefined });
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
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>License Number</label>
          <input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>License Expiry</label>
          <input type="date" value={licenseExpiry} onChange={(e) => setLicenseExpiry(e.target.value)} className={inputClass} />
        </div>
      </div>
      <div>
        <label className={labelClass}>Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1.5 h-16 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none" />
      </div>
      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
