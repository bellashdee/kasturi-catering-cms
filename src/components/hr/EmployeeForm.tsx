"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createEmployee, updateEmployee, type EmployeeInput } from "@/lib/hr/employeeActions";

type Company = { id: string; name: string };
type Department = { id: string; company_id: string; name: string; is_active: boolean };
type ManagerOption = { id: string; company_id: string; full_name: string };

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:bg-surface-alt disabled:text-text-muted";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

export function EmployeeForm({
  companies,
  departments,
  managers,
  defaultCompanyId,
  employeeId,
  initial,
  accounts,
  initialUserId,
}: {
  companies: Company[];
  departments: Department[];
  managers: ManagerOption[];
  defaultCompanyId?: string;
  employeeId?: string;
  initial?: Partial<EmployeeInput>;
  /** Admins only: login accounts that can be linked to this staff record (own OT submission). */
  accounts?: { id: string; label: string }[];
  initialUserId?: string | null;
}) {
  const router = useRouter();
  const editing = Boolean(employeeId);
  const [linkedUserId, setLinkedUserId] = useState(initialUserId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<EmployeeInput>({
    companyId: initial?.companyId ?? defaultCompanyId ?? companies[0]?.id ?? "",
    fullName: initial?.fullName ?? "",
    employeeNo: initial?.employeeNo ?? "",
    departmentId: initial?.departmentId ?? "",
    position: initial?.position ?? "",
    employmentType: initial?.employmentType ?? "full_time",
    employmentStage: initial?.employmentStage ?? "",
    joinDate: initial?.joinDate ?? "",
    probationStart: initial?.probationStart ?? "",
    probationEnd: initial?.probationEnd ?? "",
    contractEnd: initial?.contractEnd ?? "",
    reportingManagerId: initial?.reportingManagerId ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    icPassportNo: initial?.icPassportNo ?? "",
    residentialAddress: initial?.residentialAddress ?? "",
    emergencyContactName: initial?.emergencyContactName ?? "",
    emergencyContactRelationship: initial?.emergencyContactRelationship ?? "",
    emergencyContactPhone: initial?.emergencyContactPhone ?? "",
    bankName: initial?.bankName ?? "",
    bankAccountNo: initial?.bankAccountNo ?? "",
    epfNo: initial?.epfNo ?? "",
  });

  function set<K extends keyof EmployeeInput>(key: K, value: EmployeeInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const companyDepartments = useMemo(
    () => departments.filter((d) => d.company_id === form.companyId && (d.is_active || d.id === form.departmentId)),
    [departments, form.companyId, form.departmentId],
  );
  const companyManagers = useMemo(
    () => managers.filter((m) => m.company_id === form.companyId && m.id !== employeeId),
    [managers, form.companyId, employeeId],
  );

  function changeCompany(id: string) {
    setForm((f) => ({ ...f, companyId: id, departmentId: "", reportingManagerId: "" }));
  }

  function validate(): string | null {
    if (!form.fullName.trim()) return "Full name is required.";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Email address is not valid.";
    if (form.probationStart && form.probationEnd && form.probationEnd < form.probationStart) return "Probation end date cannot be before its start date.";
    if (form.joinDate && form.contractEnd && form.contractEnd < form.joinDate) return "Contract end date cannot be before the start date.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    const payload: EmployeeInput = accounts ? { ...form, userId: linkedUserId || null } : form;
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {error && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <fieldset className="flex flex-col gap-4">
        <legend className="text-[13px] font-bold text-text">Employment</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="company">Company *</label>
            <select id="company" required disabled={editing} value={form.companyId} onChange={(e) => changeCompany(e.target.value)} className={inputClass}>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {editing && <p className="mt-1 text-[11.5px] text-text-muted">The company of an existing employee cannot be changed here.</p>}
          </div>
          <div>
            <label className={labelClass} htmlFor="fullName">Full Name *</label>
            <input id="fullName" required value={form.fullName} onChange={(e) => set("fullName", e.target.value)} className={inputClass} placeholder="e.g. Aina Ismail" maxLength={200} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass} htmlFor="employeeNo">Employee ID</label>
            <input id="employeeNo" value={form.employeeNo ?? ""} onChange={(e) => set("employeeNo", e.target.value)} className={inputClass} placeholder="Company's own ID" maxLength={40} />
          </div>
          <div>
            <label className={labelClass} htmlFor="department">Department</label>
            <select id="department" value={form.departmentId ?? ""} onChange={(e) => set("departmentId", e.target.value)} className={inputClass}>
              <option value="">— None —</option>
              {companyDepartments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}{d.is_active ? "" : " (inactive)"}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="position">Job Title</label>
            <input id="position" value={form.position ?? ""} onChange={(e) => set("position", e.target.value)} className={inputClass} placeholder="e.g. Head Chef" maxLength={120} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass} htmlFor="employmentType">Employment Type</label>
            <select id="employmentType" value={form.employmentType} onChange={(e) => set("employmentType", e.target.value)} className={inputClass}>
              <option value="full_time">Full-time</option>
              <option value="part_time">Part-time</option>
              <option value="contract">Contract</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="joinDate">Employment Start Date</label>
            <input id="joinDate" type="date" value={form.joinDate ?? ""} onChange={(e) => set("joinDate", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="manager">Reporting Manager</label>
            <select id="manager" value={form.reportingManagerId ?? ""} onChange={(e) => set("reportingManagerId", e.target.value)} className={inputClass}>
              <option value="">— None —</option>
              {companyManagers.map((m) => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {!editing && (
            <div>
              <label className={labelClass} htmlFor="stage">Starting Status</label>
              <select id="stage" value={form.employmentStage ?? ""} onChange={(e) => set("employmentStage", e.target.value)} className={inputClass}>
                <option value="">Active</option>
                <option value="probation">Probation</option>
                <option value="confirmed">Confirmed</option>
              </select>
            </div>
          )}
          <div>
            <label className={labelClass} htmlFor="probationStart">Probation Start</label>
            <input id="probationStart" type="date" value={form.probationStart ?? ""} onChange={(e) => set("probationStart", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="probationEnd">Probation End</label>
            <input id="probationEnd" type="date" value={form.probationEnd ?? ""} onChange={(e) => set("probationEnd", e.target.value)} className={inputClass} />
          </div>
          {form.employmentType === "contract" && (
            <div>
              <label className={labelClass} htmlFor="contractEnd">Contract End</label>
              <input id="contractEnd" type="date" value={form.contractEnd ?? ""} onChange={(e) => set("contractEnd", e.target.value)} className={inputClass} />
            </div>
          )}
        </div>
        {editing && (
          <p className="text-[11.5px] text-text-muted">
            Status changes (confirmation, probation review, resignation, termination) are recorded from the employee profile so they appear in the employment history.
          </p>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-[13px] font-bold text-text">Contact</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="phone">Mobile No.</label>
            <input id="phone" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} className={inputClass} placeholder="01X-XXX XXXX" inputMode="tel" />
          </div>
          <div>
            <label className={labelClass} htmlFor="email">Email</label>
            <input id="email" type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} className={inputClass} />
          </div>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-lg border border-border-strong p-4">
        <legend className="px-1 text-[13px] font-bold text-text">
          Restricted details <span className="font-normal text-text-muted">— visible only to HR Admins and the employee</span>
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="ic">IC No. / Passport</label>
            <input id="ic" value={form.icPassportNo ?? ""} onChange={(e) => set("icPassportNo", e.target.value)} className={inputClass} autoComplete="off" />
          </div>
          <div>
            <label className={labelClass} htmlFor="address">Residential Address</label>
            <input id="address" value={form.residentialAddress ?? ""} onChange={(e) => set("residentialAddress", e.target.value)} className={inputClass} autoComplete="off" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass} htmlFor="ecName">Emergency Contact Name</label>
            <input id="ecName" value={form.emergencyContactName ?? ""} onChange={(e) => set("emergencyContactName", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="ecRel">Relationship</label>
            <input id="ecRel" value={form.emergencyContactRelationship ?? ""} onChange={(e) => set("emergencyContactRelationship", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="ecPhone">Emergency Contact Phone</label>
            <input id="ecPhone" value={form.emergencyContactPhone ?? ""} onChange={(e) => set("emergencyContactPhone", e.target.value)} className={inputClass} inputMode="tel" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass} htmlFor="bankName">Bank Name</label>
            <input id="bankName" value={form.bankName ?? ""} onChange={(e) => set("bankName", e.target.value)} className={inputClass} placeholder="e.g. Maybank" />
          </div>
          <div>
            <label className={labelClass} htmlFor="bankAcc">Bank A/C No.</label>
            <input id="bankAcc" value={form.bankAccountNo ?? ""} onChange={(e) => set("bankAccountNo", e.target.value)} className={inputClass} inputMode="numeric" autoComplete="off" />
          </div>
          <div>
            <label className={labelClass} htmlFor="epf">No. KWSP</label>
            <input id="epf" value={form.epfNo ?? ""} onChange={(e) => set("epfNo", e.target.value)} className={inputClass} autoComplete="off" />
          </div>
        </div>
      </fieldset>

      {accounts && employeeId && (
        <div>
          <label className={labelClass} htmlFor="login">Linked Login Account</label>
          <select id="login" value={linkedUserId} onChange={(e) => setLinkedUserId(e.target.value)} className={inputClass}>
            <option value="">Not linked</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          <p className="mt-1 text-[11.5px] text-text-muted">Lets this person submit and view their own records. Create the login first under Settings → Members.</p>
        </div>
      )}

      <div className="mt-2 flex flex-col-reverse justify-end gap-2.5 sm:flex-row">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : editing ? "Save Changes" : "Add Employee"}
        </button>
      </div>
    </form>
  );
}
