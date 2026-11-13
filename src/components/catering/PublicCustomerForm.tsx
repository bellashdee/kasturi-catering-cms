"use client";

import { useState } from "react";
import { submitCustomerIntake } from "@/lib/catering/intakeActions";
import { ACTIVE_SALES_AGENTS } from "@/lib/catering/constants";
import type { CustomerIntakeInput } from "@/lib/catering/intake";
import { ChoiceSelect } from "@/components/ui/ChoiceSelect";

const AGENT_OPTIONS = ACTIVE_SALES_AGENTS.map((a) => ({ value: a, label: a }));

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const areaClass =
  "mt-1.5 h-20 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

const empty: CustomerIntakeInput = {
  salesAgent: "",
  name: "",
  contactPerson: "",
  phone: "",
  email: "",
  registrationNo: "",
  billingAddress: "",
  deliveryAddress: "",
  area: "",
  notes: "",
  website: "",
};

export function PublicCustomerForm({ companySlug }: { companySlug: string }) {
  const [form, setForm] = useState<CustomerIntakeInput>(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentName, setSentName] = useState<string | null>(null);

  function set<K extends keyof CustomerIntakeInput>(key: K, value: CustomerIntakeInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await submitCustomerIntake(companySlug, form);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
      } else {
        setSentName(form.name);
        // keep the sales agent selected so several customers can be sent one after another
        setForm({ ...empty, salesAgent: form.salesAgent });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {sentName && (
        <div className="rounded-lg border border-success/30 bg-success-bg px-3 py-2 text-sm text-success">
          Thank you. The details for <span className="font-semibold">{sentName}</span> were sent to the office. You can fill in another customer below.
        </div>
      )}
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

      <div>
        <label className={labelClass}>Sales agent *</label>
        <ChoiceSelect required value={form.salesAgent} onChange={(v) => set("salesAgent", v)} options={AGENT_OPTIONS} placeholder="Search and choose your name" className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Customer / company name *</label>
        <input required maxLength={200} value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} placeholder="As it should appear on the invoice" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Contact person (PIC)</label>
          <input maxLength={200} value={form.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Registration no. (SSM)</label>
          <input maxLength={100} value={form.registrationNo} onChange={(e) => set("registrationNo", e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Phone</label>
          <input maxLength={50} value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} placeholder="e.g. 012-3456789" />
        </div>
        <div>
          <label className={labelClass}>Email</label>
          <input type="email" maxLength={200} value={form.email} onChange={(e) => set("email", e.target.value)} className={inputClass} />
        </div>
      </div>
      <p className="-mt-2 text-xs text-text-muted">A phone number or an email is needed.</p>

      <div>
        <label className={labelClass}>Billing address</label>
        <textarea maxLength={1000} value={form.billingAddress} onChange={(e) => set("billingAddress", e.target.value)} className={areaClass} />
      </div>
      <div>
        <label className={labelClass}>Delivery address</label>
        <textarea maxLength={1000} value={form.deliveryAddress} onChange={(e) => set("deliveryAddress", e.target.value)} className={areaClass} />
      </div>

      <div>
        <label className={labelClass}>Area</label>
        <input maxLength={200} value={form.area} onChange={(e) => set("area", e.target.value)} className={inputClass} placeholder="e.g. Kuala Lumpur, Shah Alam" />
      </div>

      <div>
        <label className={labelClass}>Notes</label>
        <textarea maxLength={2000} value={form.notes} onChange={(e) => set("notes", e.target.value)} className={areaClass} placeholder="Anything the office should know" />
      </div>

      {/* hidden honeypot field: people never see or fill it */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website</label>
        <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set("website", e.target.value)} />
      </div>

      <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
        {saving ? "Sending..." : "Send customer details"}
      </button>
    </form>
  );
}
