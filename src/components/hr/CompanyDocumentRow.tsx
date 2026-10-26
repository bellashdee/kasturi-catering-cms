"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/actionResult";
import { deleteCompanyDocument, restoreCompanyDocument, updateCompanyDocument, type CompanyDocumentRow as DocRow } from "@/lib/hr/actions";
import { COMPANY_DOC_TYPE_LABEL } from "@/lib/hr/constants";
import { fileTypeFromMime, uploadDocument, ANY_UPLOAD_ACCEPT } from "@/lib/documents/upload";
import { StatusBadge } from "@/components/StatusBadge";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";
import { RecordActions } from "@/components/shared/RecordActions";

export type CompanyDocData = {
  id: string;
  companyId: string;
  companyName: string;
  docType: string;
  title: string;
  referenceNumber: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  notes: string | null;
  documentId: string | null;
  urgency: "expired" | "expiring_soon" | "valid" | "no_expiry";
};

const inputClass = "mt-1 h-9 w-full rounded-lg border border-border-strong bg-surface px-2 text-[13px] outline-none focus:border-primary";
const labelClass = "text-[12px] font-semibold text-text-secondary";

/** One licence / agreement of the company in the Licences & Documents list, with Edit (Save / Cancel) and Delete (Undo). */
export function CompanyDocumentRow({ doc }: { doc: CompanyDocData }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [docType, setDocType] = useState(doc.docType);
  const [title, setTitle] = useState(doc.title);
  const [reference, setReference] = useState(doc.referenceNumber ?? "");
  const [issued, setIssued] = useState(doc.issuedDate ?? "");
  const [expiry, setExpiry] = useState(doc.expiryDate ?? "");
  const [notes, setNotes] = useState(doc.notes ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let documentId = doc.documentId ?? undefined;
      if (file) documentId = (await uploadDocument({ companyId: doc.companyId, module: "hr", fileType: fileTypeFromMime(file), file })).id;
      const r = await updateCompanyDocument(doc.id, { docType, title, referenceNumber: reference, issuedDate: issued, expiryDate: expiry, notes, documentId });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not save the document."));
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <form onSubmit={save} className="flex flex-col gap-3 border-b border-border bg-surface-alt/40 px-5 py-4 last:border-b-0">
        <div className="text-[13.5px] font-bold text-text">Edit document</div>
        {error && <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">{error}</div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Type *</label>
            <select value={docType} onChange={(e) => setDocType(e.target.value)} className={inputClass}>
              {Object.entries(COMPANY_DOC_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Title *</label>
            <input required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Reference number</label>
            <input maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Issued date</label>
            <input type="date" value={issued} onChange={(e) => setIssued(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Expiry date</label>
            <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Notes</label>
            <input maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Replace the file (optional)</label>
            <input type="file" accept={ANY_UPLOAD_ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-[13px]" />
          </div>
        </div>
        <div className="flex justify-end gap-2.5">
          <button type="button" disabled={busy} onClick={() => { setEditing(false); setError(null); }} className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-[13px] font-semibold text-text">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="rounded-lg bg-primary px-5 py-2 text-[13px] font-bold text-white disabled:opacity-60">
            {busy ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr_1.1fr] items-center border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0">
      <div className="font-semibold text-text">
        {doc.title}
        {doc.documentId && <DocumentViewLink documentId={doc.documentId} className="ml-2 text-xs" />}
      </div>
      <div className="text-text-secondary">{COMPANY_DOC_TYPE_LABEL[doc.docType] ?? doc.docType}</div>
      <div className="text-text-secondary">{doc.companyName}</div>
      <div className="text-text-secondary">{doc.referenceNumber ?? "—"}</div>
      <div className="flex flex-col items-start gap-1">
        <span className="text-text-secondary">{doc.expiryDate ?? "—"}</span>
        {doc.urgency === "expired" && <StatusBadge tone="danger">Expired</StatusBadge>}
        {doc.urgency === "expiring_soon" && <StatusBadge tone="warning">Expiring soon</StatusBadge>}
        {doc.urgency === "valid" && <StatusBadge tone="success">Valid</StatusBadge>}
      </div>
      <div className="flex justify-end">
        <RecordActions<DocRow>
          onEdit={() => { setError(null); setEditing(true); }}
          onDelete={() => deleteCompanyDocument(doc.id)}
          onRestore={(row) => restoreCompanyDocument(row)}
          confirmText={`Delete "${doc.title}"?`}
        />
      </div>
    </div>
  );
}
