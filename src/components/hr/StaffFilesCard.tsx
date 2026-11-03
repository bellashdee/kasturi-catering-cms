"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { deleteStaffFile, getStaffFileUrl } from "@/lib/hr/staffFileActions";
import { STAFF_FILE_KIND_LABEL, uploadStaffFile } from "@/lib/hr/staffFileUpload";
import { formatShortDate } from "@/lib/hr/probation";

export type StaffFileRow = {
  id: string;
  kind: string;
  title: string;
  issued_date: string | null;
  original_filename: string;
  company: string;
};

const btn = "h-8 whitespace-nowrap rounded-lg border border-border-strong bg-surface px-3 text-[12.5px] font-semibold text-text hover:bg-surface-alt disabled:opacity-50";
const inputClass = "mt-1 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12px] font-semibold text-text-secondary";

/** Opens or downloads one staff file through a short-lived link (the database only gives it to a Super Admin and the file's own staff member). */
export function StaffFileLink({ fileId, download = false, label }: { fileId: string; download?: boolean; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function open() {
    setBusy(true);
    setError(false);
    const result = await getStaffFileUrl(fileId, download);
    setBusy(false);
    if (!result.ok) return setError(true);
    if (download) window.location.assign(result.url);
    else window.open(result.url, "_blank", "noopener,noreferrer");
  }
  return (
    <button type="button" onClick={open} disabled={busy} className={btn}>
      {busy ? "Opening..." : error ? "Could not open - retry" : label}
    </button>
  );
}

export function StaffFilesCard({ employeeId, files, canManage }: { employeeId: string; files: StaffFileRow[]; canManage: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState("warning_letter");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!file) return;
    setBusy(true);
    setError(null);
    const result = await uploadStaffFile({ employeeId, kind, title: title.trim() || file.name.replace(/\.\w+$/, ""), issuedDate: date || undefined, file });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setAdding(false);
    setTitle("");
    setDate("");
    setFile(null);
    router.refresh();
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this file from the staff profile?")) return;
    const result = await deleteStaffFile(id);
    if (!result.ok) setError(result.error);
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {files.length === 0 ? (
        <p className="py-3 text-center text-[13px] text-text-muted">No letters or papers on file yet.</p>
      ) : (
        <div className="-mx-5 divide-y divide-border">
          {files.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-semibold text-text">{f.title}</div>
                <div className="text-[12px] text-text-secondary">
                  {STAFF_FILE_KIND_LABEL[f.kind] ?? f.kind}
                  {f.issued_date ? ` · ${formatShortDate(f.issued_date)}` : ""} · {f.company}
                </div>
              </div>
              <div className="flex gap-2">
                <StaffFileLink fileId={f.id} label="View" />
                <StaffFileLink fileId={f.id} download label="Download" />
                {canManage && (
                  <button type="button" onClick={() => remove(f.id)} className="h-8 rounded-lg border border-danger/40 px-3 text-[12.5px] font-semibold text-danger">
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

      {canManage &&
        (adding ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border-strong p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={labelClass}>Type</label>
                <Select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}>
                  {Object.entries(STAFF_FILE_KIND_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className={labelClass}>Name</label>
                <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. First Warning Letter" />
              </div>
              <div>
                <label className={labelClass}>Date of the letter</label>
                <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <input type="file" accept="application/pdf,.docx,.doc,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
            <p className="text-[12px] text-text-muted">Only this staff member and the Super Admins (Madam Penny and Nabilah) can see this file.</p>
            <div className="flex gap-2">
              <button type="button" disabled={!file || busy} onClick={save} className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white disabled:opacity-60">
                {busy ? "Uploading..." : "Upload"}
              </button>
              <button type="button" onClick={() => setAdding(false)} className={btn}>Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className={`${btn} self-start`}>+ Add letter / file</button>
        ))}
    </div>
  );
}
