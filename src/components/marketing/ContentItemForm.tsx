"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createContentItem } from "@/lib/marketing/actions";

type Campaign = { id: string; name: string; company_id: string };
type Company = { id: string; name: string };

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

export function ContentItemForm({
  companies,
  defaultCompanyId,
  campaigns,
  defaultCampaignId,
  redirectTo,
}: {
  companies: Company[];
  defaultCompanyId?: string;
  campaigns: Campaign[];
  defaultCampaignId?: string;
  redirectTo: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [campaignId, setCampaignId] = useState(defaultCampaignId ?? "");
  const campaignsForCompany = campaigns.filter((c) => c.company_id === companyId);
  const [platform, setPlatform] = useState("instagram");
  const [contentType, setContentType] = useState("post");
  const [title, setTitle] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [status, setStatus] = useState("idea");
  const [notes, setNotes] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createContentItem({
        companyId,
        campaignId: campaignId || undefined,
        platform,
        contentType,
        title,
        scheduledDate: scheduledDate || undefined,
        status,
        notes: notes || undefined,
      });
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

      <div>
        <label className={labelClass}>Title *</label>
        <input required value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="e.g. Raya menu teaser reel" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Campaign</label>
          <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={inputClass}>
            <option value="">None</option>
            {campaignsForCompany.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Platform</label>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={inputClass}>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
            <option value="x">X (Twitter)</option>
            <option value="linkedin">LinkedIn</option>
            <option value="website">Website</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Content Type</label>
          <select value={contentType} onChange={(e) => setContentType(e.target.value)} className={inputClass}>
            <option value="post">Post</option>
            <option value="story">Story</option>
            <option value="reel">Reel</option>
            <option value="video">Video</option>
            <option value="blog">Blog</option>
            <option value="ad">Ad</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
            <option value="idea">Idea</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="published">Published</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Scheduled Date</label>
          <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1.5 h-20 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" />
      </div>

      <div className="mt-2 flex justify-end gap-2.5">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Add to Calendar"}
        </button>
      </div>
    </form>
  );
}
