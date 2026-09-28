"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPromotion } from "@/lib/marketing/actions";

type Campaign = { id: string; name: string; company_id: string };
type Company = { id: string; name: string };

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

export function PromotionForm({
  companies,
  defaultCompanyId,
  campaigns,
}: {
  companies: Company[];
  defaultCompanyId?: string;
  campaigns: Campaign[];
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const campaignsForCompany = campaigns.filter((c) => c.company_id === companyId);
  const [discountType, setDiscountType] = useState("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("scheduled");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createPromotion({
        companyId,
        campaignId: campaignId || undefined,
        title,
        code: code || undefined,
        discountType,
        discountValue: Number(discountValue),
        startDate,
        endDate,
        status,
      });
      router.push("/marketing/promotions");
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
          <select
            required
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value);
              setCampaignId("");
            }}
            className={inputClass}
          >
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Promotion Title *</label>
          <input required value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="e.g. Raya Early Bird 10% Off" />
        </div>
        <div>
          <label className={labelClass}>Promo Code</label>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className={inputClass} placeholder="e.g. RAYA10" />
        </div>
      </div>

      <div>
        <label className={labelClass}>Linked Campaign</label>
        <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={inputClass}>
          <option value="">None</option>
          {campaignsForCompany.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Discount Type</label>
          <select value={discountType} onChange={(e) => setDiscountType(e.target.value)} className={inputClass}>
            <option value="percentage">Percentage (%)</option>
            <option value="fixed">Fixed (RM)</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Discount Value *</label>
          <input type="number" step="0.01" min="0" required value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
            <option value="scheduled">Scheduled</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Start Date *</label>
          <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>End Date *</label>
          <input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Create Promotion"}
        </button>
      </div>
    </form>
  );
}
