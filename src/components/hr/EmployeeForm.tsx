"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GENDER_OPTIONS, MARITAL_STATUS_OPTIONS, dobFromIc } from "@/lib/hr/ic";
import { attachEmployeeToCompanies, createEmployeeInCompanies, updateEmployee, type EmployeeInput } from "@/lib/hr/actions";

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
  accounts,
  initialUserId,
  attachedCompanyIds = [],
}: {
  companies: Company[];
  defaultCompanyId?: string;
  employeeId?: string;
  initial?: Partial<EmployeeInput>;
  /** Super Admin / Company Admin only: shows the bank and KWSP fields. */
  canEditPrivate?: boolean;
  /** Admins only: login accounts that can be linked to this staff record (own OT submission). */
  accounts?: { id: string; label: string }[];
  initialUserId?: string | null;
  /** Editing: the companies where this person already has a staff record (shown ticked and locked). */
  attachedCompanyIds?: string[];
}) {
  const router = useRouter();
  const [workCompanyIds, setWorkCompanyIds] = useState<string[]>(() => (employeeId ? [] : defaultCompanyId ? [defaultCompanyId] : companies[0] ? [companies[0].id] : []));
  const [linkedUserId, setLinkedUserId] = useState(initialUserId ?? "");
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
    dateOfBirth: initial?.dateOfBirth ?? "",
    nationality: initial?.nationality ?? "",
    gender: initial?.gender ?? "",
    race: initial?.race ?? "",
    religion: initial?.religion ?? "",
    maritalStatus: initial?.maritalStatus ?? "",
    branch: initial?.branch ?? "",
  });

  function set<K extends keyof EmployeeInput>(key: K, value: EmployeeInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId && workCompanyIds.length === 0) {
      setError("Tick at least one company where this person works.");
      return;
    }
    setSaving(true);
    setError(null);
    // Non-admins never send the bank / KWSP fields at all, so they can't blank them out by accident.
    const base: EmployeeInput = canEditPrivate ? form : { ...form, bankName: undefined, bankAccountNo: undefined, epfNo: undefined };
    const payload: EmployeeInput = accounts ? { ...base, userId: linkedUserId || null } : base;
    try {
      if (employeeId) {
        await updateEmployee(employeeId, payload);
        if (workCompanyIds.length > 0) await attachEmployeeToCompanies(employeeId, workCompanyIds);
        router.push(`/hr/${employeeId}`);
      } else {
        const { companyId: ignored, ...rest } = payload;
        void ignored;
        const created = await createEmployeeInCompanies(rest, workCompanyIds);
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

      <div>
        <label className={labelClass}>Full Name *</label>
        <input required value={form.fullName} onChange={(e) => set("fullName", e.target.value)} className={inputClass} placeholder="e.g. Aina Ismail" />
      </div>

      <fieldset>
        <legend className={labelClass}>{employeeId ? "Works in these companies" : "Works in (tick every company) *"}</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {companies.map((c) => {
            const locked = employeeId ? c.id === form.companyId || attachedCompanyIds.includes(c.id) : false;
            const on = locked || workCompanyIds.includes(c.id);
            return (
              <label key={c.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-semibold ${locked ? "cursor-default border-success/40 bg-success-bg text-success" : on ? "cursor-pointer border-primary bg-info-bg text-primary" : "cursor-pointer border-border-strong bg-surface text-text-secondary"}`}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={locked}
                  onChange={() => setWorkCompanyIds((ids) => (ids.includes(c.id) ? ids.filter((x) => x !== c.id) : [...ids, c.id]))}
                  className="accent-[var(--color-primary)]"
                />
                {c.name}
                {locked && <span className="text-[11px] font-normal">already attached</span>}
              </label>
            );
          })}
        </div>
        <p className="mt-1 text-[11.5px] text-text-muted">
          {employeeId
            ? "Tick another company to attach this person to it: a staff record with the same details is created there (leave, payroll and OT stay separate for each company)."
            : "One name can work in several companies: a staff record is created in each ticked company, and the list shows the person once."}
        </p>
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Department</label>
          <input value={form.department} onChange={(e) => set("department", e.target.value)} className={inputClass} placeholder="e.g. Kitchen" />
        </div>
        <div>
          <label className={labelClass}>Position</label>
          <input value={form.position} onChange={(e) => set("position", e.target.value.toUpperCase())} className={`${inputClass} uppercase`} placeholder="e.g. HEAD CHEF" />
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
          <label className={labelClass}>IC Number / Passport No.</label>
          <input
            value={form.icPassportNo}
            onChange={(e) => {
              const value = e.target.value;
              // the date of birth follows the IC number until somebody types a different one
              const before = dobFromIc(form.icPassportNo);
              const keepTyped = form.dateOfBirth && form.dateOfBirth !== before;
              setForm((f) => ({ ...f, icPassportNo: value, dateOfBirth: keepTyped ? f.dateOfBirth : (dobFromIc(value) ?? (f.dateOfBirth === before ? "" : f.dateOfBirth)) }));
            }}
            className={inputClass}
          />
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

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Date of Birth (from IC number)</label>
          <input type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Nationality</label>
          <input value={form.nationality} onChange={(e) => set("nationality", e.target.value)} className={inputClass} placeholder="e.g. Malaysian" />
        </div>
        <div>
          <label className={labelClass}>Gender</label>
          <select value={form.gender} onChange={(e) => set("gender", e.target.value)} className={inputClass}>
            <option value="">Select</option>
            {GENDER_OPTIONS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Race</label>
          <input value={form.race} onChange={(e) => set("race", e.target.value)} className={inputClass} placeholder="e.g. Malay" />
        </div>
        <div>
          <label className={labelClass}>Religion</label>
          <input value={form.religion} onChange={(e) => set("religion", e.target.value)} className={inputClass} placeholder="e.g. Muslim" />
        </div>
        <div>
          <label className={labelClass}>Marital Status</label>
          <select value={form.maritalStatus} onChange={(e) => set("maritalStatus", e.target.value)} className={inputClass}>
            <option value="">Select</option>
            {MARITAL_STATUS_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>Branch</label>
        <input value={form.branch} onChange={(e) => set("branch", e.target.value)} className={inputClass} placeholder="e.g. Johor Bahru" />
      </div>

      {accounts && employeeId && (
        <div>
          <label className={labelClass}>Linked Login Account</label>
          <select value={linkedUserId} onChange={(e) => setLinkedUserId(e.target.value)} className={inputClass}>
            <option value="">Not linked</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          <p className="mt-1 text-[11.5px] text-text-muted">Lets this person submit and view their own OT (Staff OT Form). Create the login first under Settings → Members.</p>
        </div>
      )}

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
