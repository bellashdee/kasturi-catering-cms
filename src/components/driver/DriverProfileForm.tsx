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
  accounts,
}: {
  driverId: string;
  initial: {
    license_number: string | null;
    license_expiry: string | null;
    notes: string | null;
    approved_latitude: number | null;
    approved_longitude: number | null;
    user_id: string | null;
  };
  /** Login accounts that can be linked to this driver (admins only). */
  accounts: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [userId, setUserId] = useState(initial.user_id ?? "");
  const [licenseNumber, setLicenseNumber] = useState(initial.license_number ?? "");
  const [licenseExpiry, setLicenseExpiry] = useState(initial.license_expiry ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [approvedLatitude, setApprovedLatitude] = useState(initial.approved_latitude?.toString() ?? "");
  const [approvedLongitude, setApprovedLongitude] = useState(initial.approved_longitude?.toString() ?? "");
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function useCurrentLocation() {
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setApprovedLatitude(position.coords.latitude.toFixed(6));
        setApprovedLongitude(position.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => {
        setError("Could not get this device's location.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateDriver(driverId, {
        licenseNumber: licenseNumber || undefined,
        licenseExpiry: licenseExpiry || undefined,
        notes: notes || undefined,
        approvedLatitude: approvedLatitude ? Number(approvedLatitude) : undefined,
        approvedLongitude: approvedLongitude ? Number(approvedLongitude) : undefined,
        userId: userId || null,
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
        <label className={labelClass}>Linked Login Account</label>
        <select value={userId} onChange={(e) => setUserId(e.target.value)} className={inputClass}>
          <option value="">Not linked</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <p className="mt-1 text-[11px] text-text-muted">
          This driver can only clock in/out when signed in with this account. Create the login first under Settings → Members.
        </p>
      </div>
      <div>
        <label className={labelClass}>Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1.5 h-16 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none" />
      </div>

      <div className="rounded-lg border border-border-strong p-3">
        <div className="flex items-center justify-between">
          <span className={labelClass}>Approved Clock-In Location</span>
          <button type="button" onClick={useCurrentLocation} disabled={locating} className="text-[12px] font-semibold text-primary disabled:opacity-60">
            {locating ? "Locating..." : "Use my current location"}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-text-muted">
          Stand at this driver&apos;s approved clock-in location, then tap &quot;Use my current location.&quot; They can only clock in/out within 5 km of this point.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-text-muted">Latitude</label>
            <input
              type="number"
              step="any"
              value={approvedLatitude}
              onChange={(e) => setApprovedLatitude(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-[11px] text-text-muted">Longitude</label>
            <input
              type="number"
              step="any"
              value={approvedLongitude}
              onChange={(e) => setApprovedLongitude(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
