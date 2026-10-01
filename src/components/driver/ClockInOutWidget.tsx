"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDocument } from "@/lib/documents/upload";
import { clockIn, clockOut } from "@/lib/driverAttendance/actions";
import { getCurrentPosition } from "@/lib/driverAttendance/geo";

export function ClockInOutWidget({ companies }: { companies: { id: string; name: string }[] }) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [driverName, setDriverName] = useState("");
  const [mode, setMode] = useState<"in" | "out">("in");
  const [photo, setPhoto] = useState<File | null>(null);
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!driverName.trim()) {
      setError("Type the driver's name.");
      return;
    }
    if (!photo) {
      setError("A face photo is required as attendance proof.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const position = await getCurrentPosition();
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      const doc = await uploadDocument({ companyId, module: "driver-logistics", fileType: "photo", file: photo });
      if (mode === "in") {
        await clockIn({ companyId, driverName: driverName.trim(), documentId: doc.id, remarks: remarks || undefined, latitude, longitude });
        setSuccess("Clocked in successfully.");
      } else {
        await clockOut({ companyId, driverName: driverName.trim(), documentId: doc.id, remarks: remarks || undefined, latitude, longitude });
        setSuccess("Clocked out successfully.");
      }
      setPhoto(null);
      setRemarks("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save attendance.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="text-[15px] font-bold text-text">Driver Clock In / Clock Out</div>
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">{error}</div>}
      {success && <div className="rounded-lg border border-success/30 bg-success-bg px-3 py-2 text-xs text-success">{success}</div>}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Company *</label>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]">
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Driver Name *</label>
          <input
            value={driverName}
            onChange={(e) => setDriverName(e.target.value)}
            placeholder="Type the driver's name"
            className="mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("in")}
          className={`flex-1 rounded-lg py-2 text-[13px] font-bold ${mode === "in" ? "bg-success text-white" : "border border-border-strong text-text-secondary"}`}
        >
          Clock In
        </button>
        <button
          type="button"
          onClick={() => setMode("out")}
          className={`flex-1 rounded-lg py-2 text-[13px] font-bold ${mode === "out" ? "bg-danger text-white" : "border border-border-strong text-text-secondary"}`}
        >
          Clock Out
        </button>
      </div>

      <div>
        <label className="text-[12px] font-semibold text-text-secondary">Face Photo (attendance proof) *</label>
        <input
          type="file"
          accept="image/*"
          capture="user"
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-[13px]"
        />
        <p className="mt-1 text-[11px] text-text-muted">Used only as proof of attendance — not for facial recognition.</p>
      </div>

      <div>
        <label className="text-[12px] font-semibold text-text-secondary">Remarks (optional)</label>
        <input value={remarks} onChange={(e) => setRemarks(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]" />
      </div>

      <p className="text-[11px] text-text-muted">
        Your device will ask for location access — you must be within 5 km of your approved clock-in location.
      </p>

      <button
        type="submit"
        disabled={saving}
        className={`rounded-lg py-2.5 text-[13px] font-bold text-white disabled:opacity-60 ${mode === "in" ? "bg-success" : "bg-danger"}`}
      >
        {saving ? "Saving..." : mode === "in" ? "Confirm Clock In" : "Confirm Clock Out"}
      </button>
    </form>
  );
}
