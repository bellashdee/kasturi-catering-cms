"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupplier, updateSupplier, type SupplierInput } from "@/lib/procurement/actions";
import { Select } from "@/components/ui/Select";

type Company = { id: string; name: string };

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

export function SupplierForm({
  companies,
  defaultCompanyId,
  supplierId,
  initial,
}: {
  companies: Company[];
  defaultCompanyId?: string;
  supplierId?: string;
  initial?: Partial<SupplierInput>;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(initial?.companyId ?? defaultCompanyId ?? companies[0]?.id ?? "");
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    category: initial?.category ?? "",
    contactPerson: initial?.contactPerson ?? "",
    phone: initial?.phone ?? "",
    paymentTerms: initial?.paymentTerms ?? "",
    status: initial?.status ?? "active",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload: SupplierInput = { companyId, ...form };
    try {
      if (supplierId) {
        await updateSupplier(supplierId, payload);
        router.push(`/supplier-procurement/${supplierId}`);
      } else {
        const created = await createSupplier(payload);
        router.push(`/supplier-procurement/${created.id}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Company *</label>
          <Select required value={companyId} onChange={(e) => setCompanyId(e.target.value)} disabled={!!supplierId} className={inputClass}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div>
          <label className={labelClass}>Supplier Name *</label>
          <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Category</label>
          <input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className={inputClass} placeholder="e.g. Fresh Produce, Packaging" />
        </div>
        <div>
          <label className={labelClass}>Payment Terms</label>
          <input value={form.paymentTerms} onChange={(e) => setForm((f) => ({ ...f, paymentTerms: e.target.value }))} className={inputClass} placeholder="e.g. Net 30" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Contact Person</label>
          <input value={form.contactPerson} onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Phone</label>
          <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Status</label>
        <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={`${inputClass} max-w-xs`}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="blacklisted">Blacklisted</option>
        </Select>
      </div>

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving || !form.name.trim()} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : supplierId ? "Save Changes" : "Add Supplier"}
        </button>
      </div>
    </form>
  );
}
