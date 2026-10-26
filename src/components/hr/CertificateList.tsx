"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/actionResult";
import { deleteCertificate, restoreCertificate, updateCertificate, type CertificateRow } from "@/lib/hr/actions";
import { fileTypeFromMime, uploadDocument, ANY_UPLOAD_ACCEPT } from "@/lib/documents/upload";
import { CERT_TYPE_LABEL, NO_EXPIRY_CERT_TYPES } from "@/lib/hr/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";
import { Select } from "@/components/ui/Select";

export type CertificateItem = {
  id: string;
  companyId: string;
  certType: string;
  certName: string;
  certNumber: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  documentId: string | null;
  urgency: "expired" | "expiring_soon" | "valid" | "no_expiry";
};

const TONE: Record<CertificateItem["urgency"], "success" | "warning" | "danger" | "neutral"> = { no_expiry: "neutral", valid: "success", expiring_soon: "warning", expired: "danger" };
const LABEL: Record<CertificateItem["urgency"], string> = { no_expiry: "On file", valid: "Valid", expiring_soon: "Expiring Soon", expired: "Expired" };

const inputClass = "mt-1 h-9 w-full rounded-lg border border-border-strong bg-surface px-2 text-[13px] outline-none focus:border-primary";
const labelClass = "text-[12px] font-semibold text-text-secondary";

/**
 * The staff documents and certificates of one person. Admins can Edit (Save / Cancel) and Delete each one (Undo straight after a delete);
 * everybody who may see the record can open the attached file.
 */
export function CertificateList({ items, canEdit }: { items: CertificateItem[]; canEdit: boolean }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<CertificateRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(item: CertificateItem) {
    if (!window.confirm(`Delete "${item.certName}"? You can undo it straight after.`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await deleteCertificate(item.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDeleted(r.row);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not delete the document."));
    } finally {
      setBusy(false);
    }
  }

  async function putBack() {
    if (!deleted) return;
    setBusy(true);
    setError(null);
    try {
      const r = await restoreCertificate(deleted);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDeleted(null);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not put the document back."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="-mx-5 -mb-5 divide-y divide-border">
      {deleted && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 bg-warning-bg px-5 py-2.5 text-[13px] text-text">
          <span>Deleted: {deleted.cert_name}</span>
          <span className="flex items-center gap-3">
            <button type="button" disabled={busy} onClick={putBack} className="font-bold text-primary hover:underline disabled:opacity-50">
              Undo
            </button>
            <button type="button" onClick={() => setDeleted(null)} className="font-semibold text-text-muted hover:text-text">
              Close
            </button>
          </span>
        </div>
      )}
      {error && <div role="alert" className="px-5 py-2 text-[12.5px] text-danger">{error}</div>}
      {items.map((c) =>
        editingId === c.id ? (
          <CertificateEditor key={c.id} item={c} onClose={() => setEditingId(null)} />
        ) : (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-text">{CERT_TYPE_LABEL[c.certType] ?? c.certName}</div>
              <div className="text-xs text-text-muted">
                {c.certName}
                {c.certNumber ? ` · ${c.certNumber}` : ""} · {c.expiryDate ? `expires ${c.expiryDate}` : "no expiry"}
              </div>
              {c.documentId && <DocumentViewLink documentId={c.documentId} label="📎 View file" className="mt-0.5 text-xs" />}
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge tone={TONE[c.urgency]}>{LABEL[c.urgency]}</StatusBadge>
              {canEdit && (
                <span className="flex gap-3 text-[12.5px] font-semibold">
                  <button type="button" disabled={busy} onClick={() => { setError(null); setEditingId(c.id); }} className="text-primary hover:underline disabled:opacity-50">
                    Edit
                  </button>
                  <button type="button" disabled={busy} onClick={() => remove(c)} className="text-danger hover:underline disabled:opacity-50">
                    Delete
                  </button>
                </span>
              )}
            </div>
          </div>
        ),
      )}
    </div>
  );
}

function CertificateEditor({ item, onClose }: { item: CertificateItem; onClose: () => void }) {
  const router = useRouter();
  const [certType, setCertType] = useState(item.certType);
  const [certName, setCertName] = useState(item.certName);
  const [certNumber, setCertNumber] = useState(item.certNumber ?? "");
  const [issuedDate, setIssuedDate] = useState(item.issuedDate ?? "");
  const [expiryDate, setExpiryDate] = useState(item.expiryDate ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let documentId = item.documentId ?? undefined;
      if (file) documentId = (await uploadDocument({ companyId: item.companyId, module: "hr", fileType: fileTypeFromMime(file), file })).id;
      const r = await updateCertificate(item.id, { certType, certName, certNumber, issuedDate, expiryDate: NO_EXPIRY_CERT_TYPES.includes(certType) ? "" : expiryDate, documentId });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Could not save the document."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3 bg-surface-alt/40 px-5 py-4">
      <div className="text-[13.5px] font-bold text-text">Edit document</div>
      {error && <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Type *</label>
          <Select value={certType} onChange={(e) => setCertType(e.target.value)} className={inputClass}>
            {Object.entries(CERT_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className={labelClass}>Name *</label>
          <input required maxLength={200} value={certName} onChange={(e) => setCertName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Number</label>
          <input maxLength={100} value={certNumber} onChange={(e) => setCertNumber(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Issued date</label>
          <input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} className={inputClass} />
        </div>
        {!NO_EXPIRY_CERT_TYPES.includes(certType) && (
          <div>
            <label className={labelClass}>Expiry date</label>
            <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={inputClass} />
          </div>
        )}
        <div>
          <label className={labelClass}>Replace the file (optional)</label>
          <input type="file" accept={ANY_UPLOAD_ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-[13px]" />
        </div>
      </div>
      <div className="flex justify-end gap-2.5">
        <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-[13px] font-semibold text-text">
          Cancel
        </button>
        <button type="submit" disabled={busy} className="rounded-lg bg-primary px-5 py-2 text-[13px] font-bold text-white disabled:opacity-60">
          {busy ? "Saving..." : "Save changes"}
        </button>
      </div>
    </form>
  );
}
