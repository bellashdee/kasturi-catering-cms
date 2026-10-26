"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCustomer } from "@/lib/marketing/actions";
import { Select } from "@/components/ui/Select";

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

type Company = { id: string; name: string };

export function CustomerForm({
  companies,
  defaultCompanyId,
  redirectTo = "/marketing/customers",
}: {
  companies: Company[];
  defaultCompanyId?: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createCustomer({ companyId, name, contactPerson: contactPerson || undefined, phone: phone || undefined, email: email || undefined });
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

      {companies.length > 1 && (
        <div>
          <label className={labelClass}>Company *</label>
          <Select required value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={inputClass}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
      )}

      <div>
        <label className={labelClass}>Customer / Company Name *</label>
        <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Contact Person</label>
        <input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className={inputClass} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Add Customer"}
        </button>
      </div>
    </form>
  );
}
