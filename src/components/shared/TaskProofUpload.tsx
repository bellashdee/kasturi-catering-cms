"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDocument, fileTypeFromMime } from "@/lib/documents/upload";
import { attachTaskProof } from "@/lib/taskProofs/actions";
import { PROOF_TYPE_LABEL } from "@/lib/taskProofs/constants";

/**
 * Generic "Proof of Work" upload widget — pass any module's own table/row id
 * and it attaches one or more files as proof, with an audit-logged trail.
 * Built for Driver & Logistics deliveries; designed to be reused as-is by
 * Kitchen, Catering, Maintenance, or any other operational module later.
 */
export function TaskProofUpload({
  companyId,
  relatedTable,
  relatedId,
  revalidatePaths,
  onUploaded,
}: {
  companyId: string;
  relatedTable: string;
  relatedId: string;
  revalidatePaths?: string[];
  onUploaded?: () => void;
}) {
  const router = useRouter();
  const [proofType, setProofType] = useState("delivered_items");
  const [remarks, setRemarks] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) {
      setError("Choose at least one photo or document.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      for (const file of files) {
        const doc = await uploadDocument({ companyId, module: relatedTable, fileType: fileTypeFromMime(file), file });
        await attachTaskProof({
          companyId,
          relatedTable,
          relatedId,
          documentId: doc.id,
          proofType,
          remarks: remarks || undefined,
          revalidatePaths,
        });
      }
      setFiles([]);
      setRemarks("");
      router.refresh();
      onUploaded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload proof.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Proof Type *</label>
          <select value={proofType} onChange={(e) => setProofType(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]">
            {Object.entries(PROOF_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">Remarks (optional)</label>
          <input value={remarks} onChange={(e) => setRemarks(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]" />
        </div>
      </div>
      <div>
        <label className="text-[12px] font-semibold text-text-secondary">Photo(s) / Document(s) *</label>
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="mt-1 block w-full text-[13px]"
        />
        {files.length > 0 && <p className="mt-1 text-[11px] text-text-muted">{files.length} file{files.length === 1 ? "" : "s"} selected</p>}
      </div>
      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60">
          {saving ? "Uploading..." : "Upload Proof"}
        </button>
      </div>
    </form>
  );
}
