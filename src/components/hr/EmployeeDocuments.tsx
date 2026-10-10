"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteEmployeeDocument, recordEmployeeDocument } from "@/lib/hr/employeeActions";
import {
  EMPLOYEE_DOC_CATEGORY_LABEL,
  HR_DOCUMENT_ACCEPT,
  HR_DOCUMENT_MAX_BYTES,
  HR_DOCUMENT_MIME_TYPES,
} from "@/lib/hr/constants";
import { formatMalaysiaDate } from "@/lib/format";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";

type Doc = {
  id: string;
  category: string;
  title: string;
  original_filename: string;
  visible_to_employee: boolean;
  created_at: string;
};

const inputClass = "mt-1 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

export function EmployeeDocuments({
  employeeId,
  companyId,
  docs,
  canManage,
}: {
  employeeId: string;
  companyId: string;
  docs: Doc[];
  canManage: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState("offer_letter");
  const [title, setTitle] = useState("");
  const [visible, setVisible] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [toDelete, setToDelete] = useState<Doc | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const file = fileRef.current?.files?.[0];
    if (!title.trim()) return setMessage({ tone: "error", text: "Enter a document title." });
    if (!file) return setMessage({ tone: "error", text: "Choose a file to upload." });
    if (!HR_DOCUMENT_MIME_TYPES.includes(file.type)) return setMessage({ tone: "error", text: "Only PDF, JPG, PNG or Word (.docx) files are accepted." });
    if (file.size > HR_DOCUMENT_MAX_BYTES) return setMessage({ tone: "error", text: "The file is larger than 10 MB." });

    setUploading(true);
    const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
    const path = `${companyId}/docs/${crypto.randomUUID()}.${ext}`;
    const supabase = createClient();
    try {
      const { error: uploadError } = await supabase.storage.from("hr-documents").upload(path, file, { contentType: file.type });
      if (uploadError) throw new Error("The file could not be uploaded. Check your connection and try again.");
      const recorded = await recordEmployeeDocument({
        employeeId,
        category,
        title,
        storagePath: path,
        originalFilename: file.name,
        visibleToEmployee: visible,
      });
      if (!recorded.ok) {
        await supabase.storage.from("hr-documents").remove([path]); // don't leave an orphaned file behind
        throw new Error(recorded.error);
      }
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
      setMessage({ tone: "success", text: "Document uploaded." });
      router.refresh();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Upload failed." });
    } finally {
      setUploading(false);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await deleteEmployeeDocument(toDelete.id);
      if (!res.ok) {
        setDeleteError(res.error);
        return;
      }
      setToDelete(null);
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete the document.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {canManage && (
        <form onSubmit={upload} className="grid grid-cols-1 gap-3 rounded-lg border border-border-strong p-4 sm:grid-cols-2" noValidate>
          <div>
            <label className={labelClass} htmlFor="doc-category">Category</label>
            <select id="doc-category" value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
              {Object.entries(EMPLOYEE_DOC_CATEGORY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="doc-title">Title *</label>
            <input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} maxLength={200} placeholder="e.g. Offer letter — Oct 2026" />
          </div>
          <div>
            <label className={labelClass} htmlFor="doc-file">File (PDF, JPG, PNG, DOCX — max 10 MB) *</label>
            <input id="doc-file" ref={fileRef} type="file" accept={HR_DOCUMENT_ACCEPT} className="mt-1 block w-full text-[13px]" />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-text">
            <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
            The employee can view this document
          </label>
          <div className="sm:col-span-2 flex items-center justify-between gap-3">
            <p
              role={message?.tone === "error" ? "alert" : "status"}
              className={`text-[12.5px] font-semibold ${message?.tone === "error" ? "text-danger" : "text-success"}`}
            >
              {message?.text}
            </p>
            <button type="submit" disabled={uploading} className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">
              {uploading ? "Uploading..." : "Upload"}
            </button>
          </div>
        </form>
      )}

      {docs.length === 0 ? (
        <EmptyRow text="No HR documents on file yet." />
      ) : (
        <ul className="-mx-5 -mb-5 divide-y divide-border">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-semibold text-text">{d.title}</div>
                <div className="text-xs text-text-muted">
                  {EMPLOYEE_DOC_CATEGORY_LABEL[d.category] ?? d.category} · {formatMalaysiaDate(d.created_at)} · {d.original_filename}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {canManage && <StatusBadge tone={d.visible_to_employee ? "info" : "neutral"}>{d.visible_to_employee ? "Employee can view" : "HR only"}</StatusBadge>}
                <a href={`/hr/${employeeId}/documents/${d.id}/download`} className="text-[12.5px] font-semibold text-primary">
                  Download
                </a>
                {canManage && (
                  <button type="button" onClick={() => { setDeleteError(null); setToDelete(d); }} className="text-[12.5px] font-semibold text-danger">
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this document?"
        confirmLabel="Delete document"
        danger
        busy={deleting}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => (deleting ? undefined : setToDelete(null))}
      >
        <p>
          <strong>{toDelete?.title}</strong> will be removed from the employee file and from storage. The deletion is recorded in the audit log.
        </p>
      </ConfirmDialog>
    </div>
  );
}
