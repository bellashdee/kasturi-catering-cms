"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createEmployee, updateEmployee, type EmployeeInput } from "@/lib/hr/actions";

type Company = { id: string; name: string };

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

export function EmployeeForm({
  companies,
  defaultCompanyId,
  employeeId,
  initial,
  canEditPrivate = false,
}: {
  companies: Company[];
  defaultCompanyId?: string;
  employeeId?: string;
  initial?: Partial<EmployeeInput>;
  /** Super Admin / Company Admin only: shows the bank and KWSP fields. */
  canEditPrivate?: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<EmployeeInput>({
    companyId: initial?.companyId ?? defaultCompanyId ?? companies[0]?.id ?? "",
    fullName: initial?.fullName ?? "",
    department: initial?.department ?? "",
    position: initial?.position ?? "",
    employmentType: initial?.employmentType ?? "full_time",
    status: initial?.status ?? "active",
    joinDate: initial?.joinDate ?? "",
    icPassportNo: initial?.icPassportNo ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    bankName: initial?.bankName ?? "",
    bankAccountNo: initial?.bankAccountNo ?? "",
    epfNo: initial?.epfNo ?? "",
  });

  function set<K extends keyof EmployeeInput>(key: K, value: EmployeeInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    // Non-admins never send the bank / KWSP fields at all, so they can't blank them out by accident.
    const payload: EmployeeInput = canEditPrivate ? form : { ...form, bankName: undefined, bankAccountNo: undefined, epfNo: undefined };
    try {
      if (employeeId) {
        await updateEmployee(employeeId, payload);
        router.push(`/hr/${employeeId}`);
      } else {
        const created = await createEmployee(payload);
        router.push(`/hr/${created.id}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Company *</label>
          <select
            required
            value={form.companyId}
            onChange={(e) => set("companyId", e.target.value)}
            className={inputClass}
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Full Name *</label>
          <input required value={form.fullName} onChange={(e) => set("fullName", e.target.value)} className={inputClass} placeholder="e.g. Aina Ismail" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Department</label>
          <input value={form.department} onChange={(e) => set("department", e.target.value)} className={inputClass} placeholder="e.g. Kitchen" />
        </div>
        <div>
          <label className={labelClass}>Position</label>
          <input value={form.position} onChange={(e) => set("position", e.target.value)} className={inputClass} placeholder="e.g. Head Chef" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Employment Type</label>
          <select value={form.employmentType} onChange={(e) => set("employmentType", e.target.value)} className={inputClass}>
            <option value="full_time">Full-time</option>
            <option value="part_time">Part-time</option>
            <option value="contract">Contract</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Employment Status</label>
          <select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputClass}>
            <option value="active">Active</option>
            <option value="resigned">Resigned</option>
            <option value="terminated">Terminated</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Start Date (Tarikh Mula Kerja)</label>
          <input type="date" value={form.joinDate} onChange={(e) => set("joinDate", e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>IC No. / Passport</label>
          <input value={form.icPassportNo} onChange={(e) => set("icPassportNo", e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Mobile No.</label>
          <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} placeholder="01X-XXX XXXX" />
        </div>
        <div>
          <label className={labelClass}>Email</label>
          <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputClass} />
        </div>
      </div>

      {canEditPrivate && (
        <div className="rounded-lg border border-border-strong p-4">
          <div className="text-[12.5px] font-bold text-text">Bank &amp; KWSP <span className="font-normal text-text-muted">— visible to Super Admin and Company Admin only</span></div>
          <div className="mt-3 grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Bank Name</label>
              <input value={form.bankName ?? ""} onChange={(e) => set("bankName", e.target.value)} className={inputClass} placeholder="e.g. Maybank" />
            </div>
            <div>
              <label className={labelClass}>Bank A/C No.</label>
              <input value={form.bankAccountNo ?? ""} onChange={(e) => set("bankAccountNo", e.target.value)} className={inputClass} inputMode="numeric" />
            </div>
            <div>
              <label className={labelClass}>No. KWSP</label>
              <input value={form.epfNo ?? ""} onChange={(e) => set("epfNo", e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>
      )}

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : employeeId ? "Save Changes" : "Add Employee"}
        </button>
      </div>
    </form>
  );
}
