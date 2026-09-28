"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProcurementRequest, type ProcurementRequestInput } from "@/lib/procurement/actions";

type Company = { id: string; name: string };

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

export function ProcurementRequestForm({ companies, defaultCompanyId }: { companies: Company[]; defaultCompanyId?: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [department, setDepartment] = useState("");
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [reason, setReason] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload: ProcurementRequestInput = {
      companyId,
      department: department || undefined,
      itemName,
      quantity: Number(quantity) || 1,
      estimatedCost: estimatedCost ? Number(estimatedCost) : undefined,
      reason: reason || undefined,
    };
    try {
      await createProcurementRequest(payload);
      router.push("/supplier-procurement/requests");
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
          <select required value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={inputClass}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Department</label>
          <input value={department} onChange={(e) => setDepartment(e.target.value)} className={inputClass} placeholder="e.g. Kitchen, Events" />
        </div>
      </div>

      <div>
        <label className={labelClass}>Item *</label>
        <input required value={itemName} onChange={(e) => setItemName(e.target.value)} className={inputClass} placeholder="What do you need?" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Quantity *</label>
          <input type="number" min="1" required value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Estimated Cost (RM)</label>
          <input type="number" min="0" step="0.01" value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Reason</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1.5 h-20 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none" placeholder="Why is this needed?" />
      </div>

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving || !itemName.trim()} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Submitting..." : "Submit Request"}
        </button>
      </div>
    </form>
  );
}
