"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCampaign, updateCampaign, type CampaignInput } from "@/lib/marketing/actions";

type Company = { id: string; name: string };

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

export function CampaignForm({
  companies,
  defaultCompanyId,
  campaignId,
  initial,
}: {
  companies: Company[];
  defaultCompanyId?: string;
  campaignId?: string;
  initial?: Partial<CampaignInput>;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CampaignInput>({
    companyId: initial?.companyId ?? defaultCompanyId ?? companies[0]?.id ?? "",
    name: initial?.name ?? "",
    objective: initial?.objective ?? "",
    channel: initial?.channel ?? "social_media",
    status: initial?.status ?? "planned",
    startDate: initial?.startDate ?? "",
    endDate: initial?.endDate ?? "",
    budget: initial?.budget,
  });

  function set<K extends keyof CampaignInput>(key: K, value: CampaignInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (campaignId) {
        await updateCampaign(campaignId, form);
        router.push(`/marketing/${campaignId}`);
      } else {
        const created = await createCampaign(form);
        router.push(`/marketing/${created.id}`);
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
          <select required value={form.companyId} onChange={(e) => set("companyId", e.target.value)} className={inputClass}>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Campaign Name *</label>
          <input required value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} placeholder="e.g. Raya Catering Promo" />
        </div>
      </div>

      <div>
        <label className={labelClass}>Objective</label>
        <textarea value={form.objective} onChange={(e) => set("objective", e.target.value)} className="mt-1.5 h-20 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" placeholder="What is this campaign trying to achieve?" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Channel</label>
          <select value={form.channel} onChange={(e) => set("channel", e.target.value)} className={inputClass}>
            <option value="social_media">Social Media</option>
            <option value="advertising">Advertising</option>
            <option value="print">Print</option>
            <option value="event">Event</option>
            <option value="email">Email</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Status</label>
          <select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputClass}>
            <option value="planned">Planned</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Budget (RM)</label>
          <input type="number" step="0.01" min="0" value={form.budget ?? ""} onChange={(e) => set("budget", e.target.value ? Number(e.target.value) : undefined)} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Start Date</label>
          <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>End Date</label>
          <input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : campaignId ? "Save Changes" : "Create Campaign"}
        </button>
      </div>
    </form>
  );
}
