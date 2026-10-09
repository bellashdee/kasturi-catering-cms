"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDocument, fileTypeFromMime, ANY_UPLOAD_ACCEPT } from "@/lib/documents/upload";
import { createCampaignPerformance } from "@/lib/marketing/actions";
import { requestExtraction } from "@/lib/importFlow/extractClient";

type Tab = "manual" | "photo";

type ExtractedPerformance = {
  report_date?: string;
  impressions?: number;
  clicks?: number;
  leads_generated?: number;
  conversions?: number;
  spend?: number;
};

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

export function CampaignPerformanceUploadReview({ campaignId, companyId }: { campaignId: string; companyId: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("manual");
  const [step, setStep] = useState<"pick" | "review">("review");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    reportDate: "",
    impressions: "",
    clicks: "",
    leadsGenerated: "",
    conversions: "",
    spend: "",
  });

  function selectTab(next: Tab) {
    setTab(next);
    setFile(null);
    setDocumentId(null);
    setNotice(null);
    setError(null);
    setStep(next === "manual" ? "review" : "pick");
  }

  async function handleUploadAndExtract() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const doc = await uploadDocument({ companyId, module: "marketing", fileType: fileTypeFromMime(file), file });
      setDocumentId(doc.id);

      const { res, result } = await requestExtraction(doc.id, "campaign_performance");

      if (!res.ok) {
        setNotice(`Extraction failed (${result.error ?? "unknown error"}) — the file is saved, please fill in the fields manually.`);
      } else if (result.configured === false) {
        setNotice(result.message);
      } else {
        const extracted: ExtractedPerformance = result.extracted ?? {};
        setForm({
          reportDate: extracted.report_date ?? "",
          impressions: extracted.impressions?.toString() ?? "",
          clicks: extracted.clicks?.toString() ?? "",
          leadsGenerated: extracted.leads_generated?.toString() ?? "",
          conversions: extracted.conversions?.toString() ?? "",
          spend: extracted.spend?.toString() ?? "",
        });
        setNotice("This information was extracted automatically. Please check every field before saving.");
      }
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleConfirm() {
    if (!form.reportDate) {
      setError("Report date is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createCampaignPerformance({
        campaignId,
        companyId,
        reportDate: form.reportDate,
        impressions: form.impressions ? Number(form.impressions) : undefined,
        clicks: form.clicks ? Number(form.clicks) : undefined,
        leadsGenerated: form.leadsGenerated ? Number(form.leadsGenerated) : undefined,
        conversions: form.conversions ? Number(form.conversions) : undefined,
        spend: form.spend ? Number(form.spend) : undefined,
        documentId: documentId || undefined,
      });
      router.push(`/marketing/${campaignId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex border-b border-border px-5">
        {(["manual", "photo"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => selectTab(t)}
            className={`border-b-2 px-4 py-3.5 text-[13.5px] font-bold ${
              tab === t ? "border-primary text-primary" : "border-transparent text-text-secondary"
            }`}
          >
            {t === "manual" ? "Manual Entry" : "Analytics Screenshot"}
          </button>
        ))}
      </div>

      <div className="p-6">
        {step === "pick" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <label className="flex w-full max-w-md cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border-strong bg-surface-alt py-10">
              <svg width="28" height="28" viewBox="0 0 20 20" fill="none" stroke="var(--color-primary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="16" height="12" rx="2" />
                <circle cx="7" cy="9" r="1.4" />
                <path d="M4 15l4-4 3 3 3-4 4 5" />
              </svg>
              <span className="text-[14px] font-bold text-text">
                {file ? file.name : "Click to choose an analytics screenshot"}
              </span>
              <span className="text-[12px] text-text-muted">e.g. Instagram Insights, Facebook Ads Manager, Google Ads</span>
              <input type="file" accept={ANY_UPLOAD_ACCEPT} className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            {error && <div className="text-sm text-danger">{error}</div>}
            <button
              onClick={handleUploadAndExtract}
              disabled={!file || uploading}
              className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60"
            >
              {uploading ? "Uploading & reading screenshot..." : "Upload & Extract"}
            </button>
          </div>
        )}

        {step === "review" && (
          <div className="flex flex-col gap-4">
            {notice && (
              <div className="flex items-start gap-2 rounded-lg border border-[#CFE1F2] bg-info-bg px-3.5 py-3 text-[13px] text-[#0F3A63]">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--color-primary)" strokeWidth="1.6" className="mt-0.5 shrink-0">
                  <circle cx="10" cy="10" r="7.2" />
                  <line x1="10" y1="9" x2="10" y2="14" />
                </svg>
                <span>{notice}</span>
              </div>
            )}
            {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

            <div>
              <label className={labelClass}>Report Date *</label>
              <input type="date" value={form.reportDate} onChange={(e) => setForm((f) => ({ ...f, reportDate: e.target.value }))} className={inputClass} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Impressions</label>
                <input type="number" min="0" value={form.impressions} onChange={(e) => setForm((f) => ({ ...f, impressions: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Clicks</label>
                <input type="number" min="0" value={form.clicks} onChange={(e) => setForm((f) => ({ ...f, clicks: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Leads Generated</label>
                <input type="number" min="0" value={form.leadsGenerated} onChange={(e) => setForm((f) => ({ ...f, leadsGenerated: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Conversions</label>
                <input type="number" min="0" value={form.conversions} onChange={(e) => setForm((f) => ({ ...f, conversions: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Spend (RM)</label>
                <input type="number" step="0.01" min="0" value={form.spend} onChange={(e) => setForm((f) => ({ ...f, spend: e.target.value }))} className={inputClass} />
              </div>
            </div>

            <div className="mt-2 flex justify-end gap-2.5">
              <button type="button" onClick={() => router.push(`/marketing/${campaignId}`)} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
                Cancel
              </button>
              <button onClick={handleConfirm} disabled={saving} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-60">
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 10l4 4 8-8" />
                </svg>
                {saving ? "Saving..." : "Confirm & Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
