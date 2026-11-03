"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GENDER_OPTIONS, MARITAL_STATUS_OPTIONS, RACE_OPTIONS, RELIGION_OPTIONS, dobFromIc, withCurrent } from "@/lib/hr/ic";
import { attachEmployeeToCompanies, createEmployeeInCompanies, updateEmployee, type EmployeeInput } from "@/lib/hr/actions";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { Select } from "@/components/ui/Select";

/** The places where the staff work. */
const BRANCHES = ["KILANG 1", "KILANG 2", "RESTORAN BARA", "UTM"];
const PAY_BASIS_OPTIONS = ["Monthly", "Daily", "Hourly"];
const PAYMENT_MODE_OPTIONS = ["Bank", "Cash", "Cheque"];

type Company = { id: string; name: string };

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const textareaClass =
  "mt-1.5 w-full rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

/** One block of the Personnel Information form (General, Spouse, Emergency Contact, ...). */
function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border-strong p-4">
      <div className="text-[13.5px] font-bold text-text">
        {title}
        {note && <span className="ml-2 text-[12px] font-normal text-text-muted">— {note}</span>}
      </div>
      <div className="mt-3 flex flex-col gap-4">{children}</div>
    </section>
  );
}

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
  /** Super Admin / Company Admin only: shows the salary, bank, KWSP, SOCSO and tax fields. */
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
    shortName: initial?.shortName ?? "",
    employeeNo: initial?.employeeNo ?? "",
    oldIcNo: initial?.oldIcNo ?? "",
    passportNo: initial?.passportNo ?? "",
    homePhone: initial?.homePhone ?? "",
    addressLine: initial?.addressLine ?? "",
    addressCity: initial?.addressCity ?? "",
    addressState: initial?.addressState ?? "",
    addressPostcode: initial?.addressPostcode ?? "",
    permAddressLine: initial?.permAddressLine ?? "",
    permCity: initial?.permCity ?? "",
    permState: initial?.permState ?? "",
    permPostcode: initial?.permPostcode ?? "",
    spouseName: initial?.spouseName ?? "",
    spouseIcNo: initial?.spouseIcNo ?? "",
    spouseWorking: initial?.spouseWorking ?? "",
    childrenCount: initial?.childrenCount ?? "",
    childRelief: initial?.childRelief ?? "",
    emergencyName: initial?.emergencyName ?? "",
    emergencyPhone: initial?.emergencyPhone ?? "",
    emergencyRelationship: initial?.emergencyRelationship ?? "",
    jobLevel: initial?.jobLevel ?? "",
    dateConfirmed: initial?.dateConfirmed ?? "",
    datePromoted: initial?.datePromoted ?? "",
    resignDate: initial?.resignDate ?? "",
    educationBackground: initial?.educationBackground ?? "",
    workingExperience: initial?.workingExperience ?? "",
    socsoNo: initial?.socsoNo ?? "",
    taxNo: initial?.taxNo ?? "",
    taxBranch: initial?.taxBranch ?? "",
    bankId: initial?.bankId ?? "",
    bankBranchCode: initial?.bankBranchCode ?? "",
    basicRate: initial?.basicRate ?? "",
    payBasis: initial?.payBasis ?? "",
    paymentMode: initial?.paymentMode ?? "",
  });

  function set<K extends keyof EmployeeInput>(key: K, value: EmployeeInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  /** A plain text box for a detail of the staff record. */
  function field(key: keyof EmployeeInput, label: string, props: { placeholder?: string; upper?: boolean; type?: string; inputMode?: "numeric" | "decimal" } = {}) {
    return (
      <div>
        <label className={labelClass}>{label}</label>
        <input
          type={props.type}
          inputMode={props.inputMode}
          value={(form[key] as string | undefined) ?? ""}
          onChange={(e) => set(key, (props.upper ? e.target.value.toUpperCase() : e.target.value) as never)}
          className={`${inputClass}${props.upper ? " uppercase" : ""}`}
          placeholder={props.placeholder}
        />
      </div>
    );
  }

  function copyAddress() {
    setForm((f) => ({ ...f, permAddressLine: f.addressLine, permCity: f.addressCity, permState: f.addressState, permPostcode: f.addressPostcode }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId && workCompanyIds.length === 0) {
      setError("Tick at least one company where this person works.");
      return;
    }
    setSaving(true);
    setError(null);
    // Non-admins never send the salary / bank / KWSP / SOCSO / tax fields at all, so they can't blank them out by accident.
    const base: EmployeeInput = canEditPrivate
      ? form
      : { ...form, bankName: undefined, bankAccountNo: undefined, epfNo: undefined, socsoNo: undefined, taxNo: undefined, taxBranch: undefined, bankId: undefined, bankBranchCode: undefined, basicRate: undefined, payBasis: undefined, paymentMode: undefined };
    const payload: EmployeeInput = accounts ? { ...base, userId: linkedUserId || null } : base;
    try {
      if (employeeId) {
        const result = await updateEmployee(employeeId, payload);
        if (!result.ok) {
          setError(result.error);
          setSaving(false);
          return;
        }
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

      <Section title="General">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {field("employeeNo", "Employee No.", { placeholder: "e.g. A02", upper: true })}
          <div className="sm:col-span-2">
            <label className={labelClass}>Name *</label>
            <input required value={form.fullName} onChange={(e) => set("fullName", e.target.value)} className={inputClass} placeholder="e.g. Aina Ismail" />
          </div>
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

        <div>
          <label className={labelClass}>Address</label>
          <input value={form.addressLine ?? ""} onChange={(e) => set("addressLine", e.target.value)} className={inputClass} placeholder="e.g. NO.3, JALAN SETIA 12/10, TAMAN SETIA INDAH" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {field("addressCity", "City")}
          {field("addressState", "State")}
          {field("addressPostcode", "Postcode", { inputMode: "numeric" })}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass}>I/C No.</label>
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
              placeholder="930308-01-5956"
            />
          </div>
          {field("oldIcNo", "Old I/C No.")}
          {field("passportNo", "Passport No.", { upper: true })}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Date of Birth (from I/C No.)</label>
            <input type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Nationality</label>
            <input value={form.nationality} onChange={(e) => set("nationality", e.target.value)} className={inputClass} placeholder="e.g. Malaysian" />
          </div>
          <div>
            <label className={labelClass}>Gender</label>
            <Select value={form.gender} onChange={(e) => set("gender", e.target.value)} className={inputClass}>
              <option value="">Select</option>
              {GENDER_OPTIONS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {field("homePhone", "Phone No.")}
          <div>
            <label className={labelClass}>Mobile No.</label>
            <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} placeholder="01X-XXX XXXX" />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Race</label>
            <Select value={form.race} onChange={(e) => set("race", e.target.value)} className={inputClass}>
              <option value="">Select</option>
              {withCurrent(RACE_OPTIONS, form.race ?? "").map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className={labelClass}>Religion</label>
            <Select value={form.religion} onChange={(e) => set("religion", e.target.value)} className={inputClass}>
              <option value="">Select</option>
              {withCurrent(RELIGION_OPTIONS, form.religion ?? "").map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className={labelClass}>Marital Status</label>
            <Select value={form.maritalStatus} onChange={(e) => set("maritalStatus", e.target.value)} className={inputClass}>
              <option value="">Select</option>
              {MARITAL_STATUS_OPTIONS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </div>
        </div>
      </Section>

      <Section title="Permanent Address">
        <div className="flex items-center justify-between">
          <label className={labelClass}>Address</label>
          <button type="button" onClick={copyAddress} className="rounded-lg border border-border-strong px-3 py-1 text-[12px] font-semibold text-text">
            Same as address above
          </button>
        </div>
        <input value={form.permAddressLine ?? ""} onChange={(e) => set("permAddressLine", e.target.value)} className={`${inputClass} -mt-3`} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {field("permCity", "City")}
          {field("permState", "State")}
          {field("permPostcode", "Postcode", { inputMode: "numeric" })}
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Section title="Spouse">
          {field("spouseName", "Name")}
          {field("spouseIcNo", "I/C No.")}
          <div>
            <label className={labelClass}>Working?</label>
            <Select value={form.spouseWorking ?? ""} onChange={(e) => set("spouseWorking", e.target.value)} className={inputClass}>
              <option value="">Select</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field("childrenCount", "No. of Children", { inputMode: "numeric" })}
            {field("childRelief", "Child Relief", { inputMode: "decimal", placeholder: "e.g. 2.00" })}
          </div>
        </Section>

        <Section title="Emergency Contact">
          {field("emergencyName", "Name")}
          {field("emergencyPhone", "Phone No.")}
          {field("emergencyRelationship", "Relationship", { placeholder: "e.g. Husband, Mother" })}
        </Section>
      </div>

      <Section title="Payroll Information">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Branch</label>
            <SearchSelect value={form.branch ?? ""} onChange={(v) => set("branch", v)} options={BRANCHES} className={inputClass} placeholder="Search or choose the branch" />
          </div>
          {field("department", "Department", { placeholder: "e.g. Kitchen" })}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Job Title (Position)</label>
            <input value={form.position} onChange={(e) => set("position", e.target.value.toUpperCase())} className={`${inputClass} uppercase`} placeholder="e.g. HEAD CHEF" />
          </div>
          {field("jobLevel", "Job Level")}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <label className={labelClass}>Date Joined</label>
            <input type="date" value={form.joinDate} onChange={(e) => set("joinDate", e.target.value)} className={inputClass} />
          </div>
          {field("dateConfirmed", "Date Confirmed", { type: "date" })}
          {field("datePromoted", "Date Promoted", { type: "date" })}
          {field("resignDate", "Date Resigned", { type: "date" })}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Employment Type</label>
            <Select value={form.employmentType} onChange={(e) => set("employmentType", e.target.value)} className={inputClass}>
              <option value="full_time">Full-time</option>
              <option value="part_time">Part-time</option>
              <option value="contract">Contract</option>
            </Select>
          </div>
          <div>
            <label className={labelClass}>Status</label>
            <Select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputClass}>
              <option value="active">Active</option>
              <option value="resigned">Resigned</option>
              <option value="terminated">Terminated</option>
            </Select>
          </div>
        </div>
        <div>
          <label className={labelClass}>Short Name (label on the birthday calendar)</label>
          <input value={form.shortName} onChange={(e) => set("shortName", e.target.value.toUpperCase())} className={`${inputClass} uppercase`} placeholder="e.g. SYAMIE" />
        </div>
      </Section>

      {canEditPrivate && (
        <>
          <Section title="Salary" note="visible to Super Admin and Company Admin only">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {field("basicRate", "Basic Rate (RM)", { inputMode: "decimal" })}
              <div>
                <label className={labelClass}>Pay Basis</label>
                <Select value={form.payBasis ?? ""} onChange={(e) => set("payBasis", e.target.value)} className={inputClass}>
                  <option value="">Select</option>
                  {withCurrent(PAY_BASIS_OPTIONS, form.payBasis ?? "").map((o) => <option key={o} value={o}>{o}</option>)}
                </Select>
              </div>
              <div>
                <label className={labelClass}>Payment Mode</label>
                <Select value={form.paymentMode ?? ""} onChange={(e) => set("paymentMode", e.target.value)} className={inputClass}>
                  <option value="">Select</option>
                  {withCurrent(PAYMENT_MODE_OPTIONS, form.paymentMode ?? "").map((o) => <option key={o} value={o}>{o}</option>)}
                </Select>
              </div>
            </div>
          </Section>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Section title="Bank" note="Admin only">
              {field("bankName", "Bank Name", { placeholder: "e.g. Maybank" })}
              {field("bankAccountNo", "A/C No.", { inputMode: "numeric" })}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {field("bankId", "Bank ID")}
                {field("bankBranchCode", "Branch Code")}
              </div>
            </Section>

            <Section title="Accounts Related" note="Admin only">
              {field("epfNo", "EPF (KWSP) No.")}
              {field("socsoNo", "SOCSO No.")}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {field("taxNo", "Tax No.")}
                {field("taxBranch", "Tax Branch")}
              </div>
            </Section>
          </div>
        </>
      )}

      <Section title="Education Background">
        <textarea value={form.educationBackground ?? ""} onChange={(e) => set("educationBackground", e.target.value)} rows={3} className={textareaClass} placeholder="e.g. Diploma in Culinary Arts, 2018" />
      </Section>

      <Section title="Working Experience">
        <textarea value={form.workingExperience ?? ""} onChange={(e) => set("workingExperience", e.target.value)} rows={3} className={textareaClass} placeholder="e.g. Sous Chef, ABC Catering, 2019 - 2024" />
      </Section>

      {accounts && employeeId && (
        <div>
          <label className={labelClass}>Linked Login Account</label>
          <Select value={linkedUserId} onChange={(e) => setLinkedUserId(e.target.value)} className={inputClass}>
            <option value="">Not linked</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </Select>
          <p className="mt-1 text-[11.5px] text-text-muted">Lets this person submit and view their own OT (Staff OT Form). Create the login first under Settings → Members.</p>
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
