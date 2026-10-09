"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDocument, fileTypeFromMime, ANY_UPLOAD_ACCEPT } from "@/lib/documents/upload";
import { createCompanyDocument } from "@/lib/hr/actions";
import { COMPANY_DOC_TYPE_LABEL } from "@/lib/hr/constants";
import { requestExtraction } from "@/lib/importFlow/extractClient";

type Company = { id: string; name: string };
type Extracted = {
  doc_type?: string;
  title?: string | null;
  reference_number?: string | null;
  issued_date?: string | null;
  expiry_date?: string | null;
};

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

export function CompanyDocumentUploadReview({ companies, defaultCompanyId, redirectTo }: { companies: Company[]; defaultCompanyId?: string; redirectTo: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"upload" | "manual">("upload");
  const [step, setStep] = useState<"pick" | "review">("pick");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [docType, setDocType] = useState("mbjb_licence");
  const [title, setTitle] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [issuedDate, setIssuedDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");

  function selectMode(next: "upload" | "manual") {
    setMode(next);
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
      const doc = await uploadDocument({ companyId, module: "hr", fileType: fileTypeFromMime(file), file });
      setDocumentId(doc.id);

      const { res, result } = await requestExtraction(doc.id, "company_document");

      if (!res.ok) {
        setNotice(`Extraction failed (${result.error ?? "unknown error"}) — the file is saved, please fill in the fields manually.`);
      } else if (result.configured === false) {
        setNotice(result.message);
      } else {
        const x: Extracted = result.extracted ?? {};
        if (x.doc_type && Object.keys(COMPANY_DOC_TYPE_LABEL).includes(x.doc_type)) setDocType(x.doc_type);
        setTitle(x.title ?? "");
        setReferenceNumber(x.reference_number ?? "");
        setIssuedDate(x.issued_date ?? "");
        setExpiryDate(x.expiry_date ?? "");
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
    if (!title.trim()) {
      setError("A title is required.");
      return;
    }
    if (!expiryDate) {
      setError("Expiry date is required so reminders can work. For a tenancy, use the end date of the agreement.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createCompanyDocument({
        companyId,
        docType,
        title: title.trim(),
        referenceNumber: referenceNumber || undefined,
        issuedDate: issuedDate || undefined,
        expiryDate,
        notes: notes || undefined,
        documentId: documentId ?? undefined,
      });
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex border-b border-border px-5">
        {(["upload", "manual"] as const).map((m) => (
          <button
            key={m}
            onClick={() => selectMode(m)}
            className={`border-b-2 px-4 py-3.5 text-[13.5px] font-bold ${mode === m ? "border-primary text-primary" : "border-transparent text-text-secondary"}`}
          >
            {m === "upload" ? "Upload File (PDF / Excel / Screenshot / Photo)" : "Manual Entry"}
          </button>
        ))}
      </div>

      <div className="p-6">
        <div className="mb-4 max-w-xs">
          <label className={labelClass}>Company *</label>
          <select
            value={companyId}
            disabled={documentId !== null}
            onChange={(e) => setCompanyId(e.target.value)}
            className={`${inputClass} disabled:bg-surface-alt disabled:text-text-muted`}
          >
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {step === "pick" && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <label className="flex w-full max-w-md cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border-strong bg-surface-alt py-10">
              <span className="px-4 text-[14px] font-bold text-text">{file ? file.name : "Click to choose the licence or agreement"}</span>
              <span className="text-[12px] text-text-muted">The system reads it and pre-fills the form. Nothing is saved until you confirm.</span>
              <input type="file" accept={ANY_UPLOAD_ACCEPT} className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            {error && <div className="text-sm text-danger">{error}</div>}
            <button onClick={handleUploadAndExtract} disabled={!file || uploading} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
              {uploading ? "Uploading & reading document..." : "Upload & Extract"}
            </button>
          </div>
        )}

        {step === "review" && (
          <div className="flex flex-col gap-4">
            {notice && <div className="rounded-lg border border-[#CFE1F2] bg-info-bg px-3.5 py-3 text-[13px] text-[#0F3A63]">{notice}</div>}
            {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Document Type *</label>
                <select value={docType} onChange={(e) => setDocType(e.target.value)} className={inputClass}>
                  {Object.entries(COMPANY_DOC_TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Title *</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="e.g. MBJB Business Licence — Kitchen Jalan X" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Reference No.</label>
                <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Start / Issued Date</label>
                <input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Expiry / End Date *</label>
                <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={inputClass} />
              </div>
            </div>

            <div>
              <label className={labelClass}>Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1.5 h-16 w-full resize-none rounded-lg border border-border-strong px-3 py-2 text-sm outline-none" />
            </div>

            <div className="mt-2 flex justify-end gap-2.5">
              <button type="button" onClick={() => router.push(redirectTo)} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
                Cancel
              </button>
              <button onClick={handleConfirm} disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-60">
                {saving ? "Saving..." : "Confirm & Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
