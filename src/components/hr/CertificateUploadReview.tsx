"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDocument, fileTypeFromMime, DOCUMENT_FILE_ACCEPT } from "@/lib/documents/upload";
import { createCertificate } from "@/lib/hr/actions";
import { CERT_TYPE_LABEL, NO_EXPIRY_CERT_TYPES } from "@/lib/hr/constants";
import { requestExtraction } from "@/lib/importFlow/extractClient";
import { Select } from "@/components/ui/Select";

type Tab = "manual" | "pdf" | "photo";

type ExtractedCertificate = {
  cert_type?: string;
  cert_name?: string;
  cert_number?: string;
  issued_date?: string;
  expiry_date?: string;
  holder_name?: string;
};

function needsExpiryValue(form: { certType: string; expiryDate: string }) {
  return !NO_EXPIRY_CERT_TYPES.includes(form.certType) && !!form.expiryDate;
}

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

export function CertificateUploadReview({ employeeId, companyId }: { employeeId: string; companyId: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("manual");
  const [step, setStep] = useState<"pick" | "review">(tab === "manual" ? "review" : "pick");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    certType: "other",
    certName: "",
    certNumber: "",
    issuedDate: "",
    expiryDate: "",
  });

  function selectTab(next: Tab) {
    setTab(next);
    setFile(null);
    setDocumentId(null);
    setNotice(null);
    setError(null);
    setStep(next === "manual" ? "review" : "pick");
    setForm({ certType: "other", certName: "", certNumber: "", issuedDate: "", expiryDate: "" });
  }

  async function handleUploadAndExtract() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const doc = await uploadDocument({
        companyId,
        module: "hr",
        fileType: fileTypeFromMime(file),
        file,
      });
      setDocumentId(doc.id);

      const { res, result } = await requestExtraction(doc.id, "employee_certificate");

      if (!res.ok) {
        setNotice(`Extraction failed (${result.error ?? "unknown error"}) — the file is saved, please fill in the fields manually.`);
      } else if (result.configured === false) {
        setNotice(result.message);
      } else {
        const extracted: ExtractedCertificate = result.extracted ?? {};
        setForm({
          certType: extracted.cert_type && Object.keys(CERT_TYPE_LABEL).includes(extracted.cert_type)
            ? extracted.cert_type
            : "other",
          certName: extracted.cert_name ?? "",
          certNumber: extracted.cert_number ?? "",
          issuedDate: extracted.issued_date ?? "",
          expiryDate: extracted.expiry_date ?? "",
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
    const needsExpiry = !NO_EXPIRY_CERT_TYPES.includes(form.certType);
    if (!form.certName || (needsExpiry && !form.expiryDate)) {
      setError(needsExpiry ? "Document name and expiry date are required." : "Document name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createCertificate({
        employeeId,
        companyId,
        certType: form.certType,
        certName: form.certName,
        certNumber: form.certNumber || undefined,
        issuedDate: form.issuedDate || undefined,
        expiryDate: needsExpiryValue(form) ? form.expiryDate : undefined,
        documentId: documentId || undefined,
      });
      router.push(`/hr/${employeeId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex border-b border-border px-5">
        {(["manual", "pdf", "photo"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => selectTab(t)}
            className={`border-b-2 px-4 py-3.5 text-[13.5px] font-bold ${
              tab === t ? "border-primary text-primary" : "border-transparent text-text-secondary"
            }`}
          >
            {t === "manual" ? "Manual Entry" : t === "pdf" ? "Upload File (PDF / Excel / CSV)" : "Photo / Screenshot"}
          </button>
        ))}
      </div>

      <div className="p-6">
        {step === "pick" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <label className="flex w-full max-w-md cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border-strong bg-surface-alt py-10">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 18a4 4 0 0 1-1-7.9 5 5 0 0 1 9.6-2A4.5 4.5 0 0 1 17 18H7z" />
                <path d="M12 11v6M9.5 13.5L12 11l2.5 2.5" />
              </svg>
              <span className="text-[14px] font-bold text-text">
                {file ? file.name : `Click to choose ${tab === "pdf" ? "a file (PDF, Excel or CSV)" : "a photo or screenshot"}`}
              </span>
              <span className="text-[12px] text-text-muted">Claude reads the document and pre-fills the form below</span>
              <input
                type="file"
                accept={tab === "pdf" ? DOCUMENT_FILE_ACCEPT : "image/*"}
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {error && <div className="text-sm text-danger">{error}</div>}
            <button
              onClick={handleUploadAndExtract}
              disabled={!file || uploading}
              className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60"
            >
              {uploading ? "Uploading & reading document..." : "Upload & Extract"}
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Document Type *</label>
                <Select
                  value={form.certType}
                  onChange={(e) => setForm((f) => ({ ...f, certType: e.target.value }))}
                  className={inputClass}
                >
                  {Object.entries(CERT_TYPE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className={labelClass}>Document Name *</label>
                <input
                  value={form.certName}
                  onChange={(e) => setForm((f) => ({ ...f, certName: e.target.value }))}
                  className={inputClass}
                  placeholder="As printed on the document"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Certificate No.</label>
                <input
                  value={form.certNumber}
                  onChange={(e) => setForm((f) => ({ ...f, certNumber: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Issued Date</label>
                <input
                  type="date"
                  value={form.issuedDate}
                  onChange={(e) => setForm((f) => ({ ...f, issuedDate: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{NO_EXPIRY_CERT_TYPES.includes(form.certType) ? "Expiry Date (not needed)" : form.certType === "medical_certificate" ? "MC End Date *" : "Expiry Date *"}</label>
                <input
                  type="date"
                  value={form.expiryDate}
                  disabled={NO_EXPIRY_CERT_TYPES.includes(form.certType)}
                  onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="mt-2 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => router.push(`/hr/${employeeId}`)}
                className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-60"
              >
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
