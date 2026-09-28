"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDocument } from "@/lib/documents/upload";
import { createDriverExpense } from "@/lib/driver/actions";

type Tab = "manual" | "pdf" | "photo";
type Company = { id: string; name: string };
type Vehicle = { id: string; plate_number: string; company_id: string };
type Employee = { id: string; full_name: string; company_id: string };

type ExtractedExpense = {
  category?: string;
  description?: string;
  amount?: number;
  expense_date?: string;
};

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

export function DriverExpenseUploadReview({
  companies,
  defaultCompanyId,
  vehicles,
  employees,
  redirectTo,
}: {
  companies: Company[];
  defaultCompanyId?: string;
  vehicles: Vehicle[];
  employees: Employee[];
  redirectTo: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("manual");
  const [step, setStep] = useState<"pick" | "review">("review");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [form, setForm] = useState({ category: "fuel", description: "", amount: "", expenseDate: "", distanceKm: "" });

  const vehiclesForCompany = vehicles.filter((v) => v.company_id === companyId);
  const employeesForCompany = employees.filter((e) => e.company_id === companyId);

  function selectTab(next: Tab) {
    setTab(next);
    setFile(null);
    setDocumentId(null);
    setNotice(null);
    setError(null);
    setStep(next === "manual" ? "review" : "pick");
  }

  async function handleUploadAndExtract() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const doc = await uploadDocument({ companyId, module: "driver-logistics", fileType: tab === "pdf" ? "pdf" : "photo", file });
      setDocumentId(doc.id);

      const res = await fetch("/api/extract-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc.id, kind: "driver_expense_receipt" }),
      });
      const result = await res.json();

      if (!res.ok) {
        setNotice(`Extraction failed (${result.error ?? "unknown error"}) — the file is saved, please fill in the fields manually.`);
      } else if (result.configured === false) {
        setNotice(result.message);
      } else {
        const extracted: ExtractedExpense = result.extracted ?? {};
        setForm((f) => ({
          ...f,
          category: extracted.category && ["fuel", "toll", "parking", "mileage"].includes(extracted.category) ? extracted.category : "other",
          description: extracted.description ?? "",
          amount: extracted.amount?.toString() ?? "",
          expenseDate: extracted.expense_date ?? "",
        }));
        setNotice("This information was extracted automatically. Please check every field before saving.");
      }
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleConfirm() {
    if (!form.amount || !form.expenseDate) {
      setError("Amount and date are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createDriverExpense({
        companyId,
        vehicleId: vehicleId || undefined,
        driverId: driverId || undefined,
        category: form.category,
        distanceKm: form.category === "mileage" && form.distanceKm ? Number(form.distanceKm) : undefined,
        amount: Number(form.amount),
        expenseDate: form.expenseDate,
        notes: form.description || undefined,
        documentId: documentId || undefined,
      });
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex border-b border-border px-5">
        {(["manual", "pdf", "photo"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => selectTab(t)}
            className={`border-b-2 px-4 py-3.5 text-[13.5px] font-bold ${tab === t ? "border-primary text-primary" : "border-transparent text-text-secondary"}`}
          >
            {t === "manual" ? "Manual Entry" : t === "pdf" ? "Upload PDF" : "Photo / Screenshot"}
          </button>
        ))}
      </div>

      <div className="p-6">
        <div className="mb-4">
          <label className={labelClass}>Company *</label>
          <select
            required
            disabled={documentId !== null}
            value={companyId}
            onChange={(e) => { setCompanyId(e.target.value); setVehicleId(""); setDriverId(""); }}
            className={`${inputClass} max-w-xs disabled:bg-surface-alt disabled:text-text-muted`}
          >
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {step === "pick" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <label className="flex w-full max-w-md cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border-strong bg-surface-alt py-10">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 18a4 4 0 0 1-1-7.9 5 5 0 0 1 9.6-2A4.5 4.5 0 0 1 17 18H7z" />
                <path d="M12 11v6M9.5 13.5L12 11l2.5 2.5" />
              </svg>
              <span className="text-[14px] font-bold text-text">
                {file ? file.name : `Click to choose a ${tab === "pdf" ? "PDF receipt" : "photo of the receipt"}`}
              </span>
              <input type="file" accept={tab === "pdf" ? "application/pdf" : "image/*"} className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            {error && <div className="text-sm text-danger">{error}</div>}
            <button onClick={handleUploadAndExtract} disabled={!file || uploading} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
              {uploading ? "Uploading & reading document..." : "Upload & Extract"}
            </button>
          </div>
        )}

        {step === "review" && (
          <div className="flex flex-col gap-4">
            {notice && (
              <div className="flex items-start gap-2 rounded-lg border border-[#CFE1F2] bg-info-bg px-3.5 py-3 text-[13px] text-[#0F3A63]">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--color-primary)" strokeWidth="1.6" className="mt-0.5 shrink-0">
                  <circle cx="10" cy="10" r="7.2" />
                  <line x1="10" y1="9" x2="10" y2="14" />
                </svg>
                <span>{notice}</span>
              </div>
            )}
            {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Vehicle</label>
                <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className={inputClass}>
                  <option value="">Not linked to a vehicle</option>
                  {vehiclesForCompany.map((v) => <option key={v.id} value={v.id}>{v.plate_number}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Driver</label>
                <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className={inputClass}>
                  <option value="">Not linked to a driver</option>
                  {employeesForCompany.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Category *</label>
                <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className={inputClass}>
                  <option value="fuel">Fuel</option>
                  <option value="toll">Toll</option>
                  <option value="parking">Parking</option>
                  <option value="mileage">Mileage</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Expense Date *</label>
                <input type="date" value={form.expenseDate} onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))} className={inputClass} />
              </div>
            </div>

            {form.category === "mileage" && (
              <div>
                <label className={labelClass}>Distance (km)</label>
                <input type="number" min="0" step="0.1" value={form.distanceKm} onChange={(e) => setForm((f) => ({ ...f, distanceKm: e.target.value }))} className={`${inputClass} max-w-xs`} />
              </div>
            )}

            <div>
              <label className={labelClass}>Description</label>
              <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={inputClass} placeholder="e.g. Petronas — event trip to Cyberjaya" />
            </div>

            <div>
              <label className={labelClass}>Amount (RM) *</label>
              <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className={inputClass} />
            </div>

            <div className="mt-2 flex justify-end gap-2.5">
              <button type="button" onClick={() => router.push(redirectTo)} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
                Cancel
              </button>
              <button onClick={handleConfirm} disabled={saving} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-60">
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 10l4 4 8-8" />
                </svg>
                {saving ? "Saving..." : "Confirm & Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
