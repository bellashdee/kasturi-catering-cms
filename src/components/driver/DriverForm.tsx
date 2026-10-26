"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createDriver, type DriverInput } from "@/lib/driver/actions";
import { Select } from "@/components/ui/Select";

type Company = { id: string; name: string };
type Employee = { id: string; full_name: string; company_id: string };

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

export function DriverForm({ companies, defaultCompanyId, employees }: { companies: Company[]; defaultCompanyId?: string; employees: Employee[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [employeeId, setEmployeeId] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState("");
  const [approvedLatitude, setApprovedLatitude] = useState("");
  const [approvedLongitude, setApprovedLongitude] = useState("");
  const [locating, setLocating] = useState(false);

  const employeesForCompany = employees.filter((e) => e.company_id === companyId);

  function useCurrentLocation() {
    setLocating(true);
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
    const payload: DriverInput = {
      companyId,
      employeeId: mode === "existing" ? employeeId || undefined : undefined,
      fullName: mode === "new" ? fullName : undefined,
      phone: mode === "new" ? phone : undefined,
      licenseNumber: licenseNumber || undefined,
      licenseExpiry: licenseExpiry || undefined,
      approvedLatitude: approvedLatitude ? Number(approvedLatitude) : undefined,
      approvedLongitude: approvedLongitude ? Number(approvedLongitude) : undefined,
    };
    try {
      const created = await createDriver(payload);
      router.push(`/driver-logistics/drivers/${created.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

      <div>
        <label className={labelClass}>Company *</label>
        <Select required value={companyId} onChange={(e) => { setCompanyId(e.target.value); setEmployeeId(""); }} className={inputClass}>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => setMode("existing")} className={`flex-1 rounded-lg border px-3 py-2 text-[13px] font-semibold ${mode === "existing" ? "border-primary bg-info-bg text-primary" : "border-border-strong text-text-secondary"}`}>
          Existing HR Employee
        </button>
        <button type="button" onClick={() => setMode("new")} className={`flex-1 rounded-lg border px-3 py-2 text-[13px] font-semibold ${mode === "new" ? "border-primary bg-info-bg text-primary" : "border-border-strong text-text-secondary"}`}>
          New Person
        </button>
      </div>

      {mode === "existing" ? (
        <div>
          <label className={labelClass}>Employee *</label>
          <Select required={mode === "existing"} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputClass}>
            <option value="">Select employee</option>
            {employeesForCompany.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
          </Select>
          {employeesForCompany.length === 0 && (
            <p className="mt-1 text-xs text-text-muted">No employees found for this company yet — add them in HR, or use &quot;New Person&quot; above.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Full Name *</label>
            <input required={mode === "new"} value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
          </div>
          <p className="col-span-2 text-xs text-text-muted">This also creates a new HR employee record (position: Driver), so both modules share the same person.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>License Number</label>
          <input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>License Expiry</label>
          <input type="date" value={licenseExpiry} onChange={(e) => setLicenseExpiry(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="rounded-lg border border-border-strong p-3">
        <div className="flex items-center justify-between">
          <span className={labelClass}>Approved Clock-In Location (optional for now)</span>
          <button type="button" onClick={useCurrentLocation} disabled={locating} className="text-[12px] font-semibold text-primary disabled:opacity-60">
            {locating ? "Locating..." : "Use my current location"}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-text-muted">
          Can also be set later from this driver&apos;s profile. Until set, clock in/out is not location-restricted.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] text-text-muted">Latitude</label>
            <input type="number" step="any" value={approvedLatitude} onChange={(e) => setApprovedLatitude(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="text-[11px] text-text-muted">Longitude</label>
            <input type="number" step="any" value={approvedLongitude} onChange={(e) => setApprovedLongitude(e.target.value)} className={inputClass} />
          </div>
        </div>
      </div>

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Add Driver"}
        </button>
      </div>
    </form>
  );
}
