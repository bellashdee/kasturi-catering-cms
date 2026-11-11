"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GENDER_OPTIONS, MARITAL_STATUS_OPTIONS, RACE_OPTIONS, RELIGION_OPTIONS, withCurrent } from "@/lib/hr/ic";
import { updateOwnProfile, type OwnProfileInput } from "@/lib/hr/actions";
import { Select } from "@/components/ui/Select";

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const textareaClass =
  "mt-1.5 w-full rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

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

/** A staff member changes their own details. Name, IC number, email, job details and salary are shown as plain text: HR changes those. */
export function OwnProfileForm({
  initial,
  fixed,
  returnTo,
}: {
  initial: OwnProfileInput;
  /** the details only HR can change, shown for reference */
  fixed: { name: string; ic: string; email: string; position: string; company: string };
  returnTo: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<OwnProfileInput>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof OwnProfileInput>(key: K, value: OwnProfileInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function field(key: keyof OwnProfileInput, label: string, props: { placeholder?: string; upper?: boolean; inputMode?: "numeric" | "decimal" } = {}) {
    return (
      <div>
        <label className={labelClass}>{label}</label>
        <input
          inputMode={props.inputMode}
          value={(form[key] as string | undefined) ?? ""}
          onChange={(e) => set(key, (props.upper ? e.target.value.toUpperCase() : e.target.value) as never)}
          className={`${inputClass}${props.upper ? " uppercase" : ""}`}
          placeholder={props.placeholder}
        />
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = await updateOwnProfile(form);
    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }
    router.push(returnTo);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

      <Section title="Kept by HR" note="to change these, ask HR">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {[
            ["Name", fixed.name],
            ["I/C No.", fixed.ic],
            ["Email", fixed.email],
            ["Position", fixed.position],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
              <dd className="mt-0.5 text-[14px] font-semibold text-text">{value || "—"}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[12px] text-text-muted">
          What you save here is saved on your staff record in every company you work for ({fixed.company}).
        </p>
      </Section>

      <Section title="Personal">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {field("phone", "Mobile No.", { placeholder: "01X-XXX XXXX" })}
          {field("homePhone", "Phone No.")}
          <div>
            <label className={labelClass}>Date of Birth</label>
            <input type="date" value={form.dateOfBirth ?? ""} onChange={(e) => set("dateOfBirth", e.target.value)} className={inputClass} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Gender</label>
            <Select value={form.gender ?? ""} onChange={(e) => set("gender", e.target.value)} className={inputClass}>
              <option value="">Select</option>
              {GENDER_OPTIONS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </Select>
          </div>
          {field("nationality", "Nationality", { placeholder: "e.g. Malaysian" })}
          <div>
            <label className={labelClass}>Marital Status</label>
            <Select value={form.maritalStatus ?? ""} onChange={(e) => set("maritalStatus", e.target.value)} className={inputClass}>
              <option value="">Select</option>
              {MARITAL_STATUS_OPTIONS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Race</label>
            <Select value={form.race ?? ""} onChange={(e) => set("race", e.target.value)} className={inputClass}>
              <option value="">Select</option>
              {withCurrent(RACE_OPTIONS, form.race ?? "").map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className={labelClass}>Religion</label>
            <Select value={form.religion ?? ""} onChange={(e) => set("religion", e.target.value)} className={inputClass}>
              <option value="">Select</option>
              {withCurrent(RELIGION_OPTIONS, form.religion ?? "").map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </div>
          {field("shortName", "Short Name (birthday calendar)", { upper: true, placeholder: "e.g. SYAMIE" })}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {field("oldIcNo", "Old I/C No.")}
          {field("passportNo", "Passport No.", { upper: true })}
        </div>
      </Section>

      <Section title="Address">
        <div>
          <label className={labelClass}>Address</label>
          <input value={form.addressLine ?? ""} onChange={(e) => set("addressLine", e.target.value)} className={inputClass} placeholder="e.g. NO.3, JALAN SETIA 12/10, TAMAN SETIA INDAH" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {field("addressCity", "City")}
          {field("addressState", "State")}
          {field("addressPostcode", "Postcode", { inputMode: "numeric" })}
        </div>
      </Section>

      <Section title="Permanent Address">
        <div className="flex items-center justify-between">
          <label className={labelClass}>Address</label>
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, permAddressLine: f.addressLine, permCity: f.addressCity, permState: f.addressState, permPostcode: f.addressPostcode }))}
            className="rounded-lg border border-border-strong px-3 py-1 text-[12px] font-semibold text-text"
          >
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
        <Section title="Emergency Contact">
          {field("emergencyName", "Name")}
          {field("emergencyPhone", "Phone No.")}
          {field("emergencyRelationship", "Relationship", { placeholder: "e.g. Husband, Mother" })}
        </Section>

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
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Section title="Bank" note="HR can see changes">
          {field("bankName", "Bank Name", { placeholder: "e.g. Maybank" })}
          {field("bankAccountNo", "A/C No.", { inputMode: "numeric" })}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field("bankId", "Bank ID")}
            {field("bankBranchCode", "Branch Code")}
          </div>
        </Section>

        <Section title="Accounts Related">
          {field("epfNo", "EPF (KWSP) No.")}
          {field("socsoNo", "SOCSO No.")}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field("taxNo", "Tax No.")}
            {field("taxBranch", "Tax Branch")}
          </div>
          <p className="text-[12px] text-text-muted">If you do not have one (for example a foreign worker with no KWSP), leave it empty.</p>
        </Section>
      </div>

      <Section title="Education Background">
        <textarea value={form.educationBackground ?? ""} onChange={(e) => set("educationBackground", e.target.value)} rows={3} className={textareaClass} placeholder="e.g. Diploma in Culinary Arts, 2018" />
      </Section>

      <Section title="Working Experience">
        <textarea value={form.workingExperience ?? ""} onChange={(e) => set("workingExperience", e.target.value)} rows={3} className={textareaClass} placeholder="e.g. Sous Chef, ABC Catering, 2019 - 2024" />
      </Section>

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Save my details"}
        </button>
      </div>
    </form>
  );
}
