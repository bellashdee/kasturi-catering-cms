"use client";

import type { ImportTab } from "@/lib/importFlow/useDocumentUpload";
import type { DuplicateMatch } from "@/lib/importFlow/types";
import type { ExtractionReport } from "@/lib/extraction/types";
import { ExtractionReportPanel } from "@/components/shared/import/ExtractionReportPanel";
import { GoogleDrivePickButton } from "@/components/shared/GoogleDrivePickButton";

/**
 * The shared visual chrome every Upload/OCR flow in the system uses, so a
 * module only ever writes its own field-specific JSX — never another copy of
 * these tabs, dropzone, banners or buttons.
 */
export function ImportTabs({
  tab,
  onSelect,
  pdfLabel = "Upload File (PDF / Excel / CSV)",
  photoLabel = "Photo / Screenshot",
}: {
  tab: ImportTab;
  onSelect: (tab: ImportTab) => void;
  pdfLabel?: string;
  photoLabel?: string;
}) {
  const tabs: { key: ImportTab; label: string }[] = [
    { key: "manual", label: "Manual Entry" },
    { key: "pdf", label: pdfLabel },
    { key: "photo", label: photoLabel },
  ];
  return (
    <div className="flex border-b border-border px-5">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onSelect(t.key)}
          className={`border-b-2 px-4 py-3.5 text-[13.5px] font-bold ${tab === t.key ? "border-primary text-primary" : "border-transparent text-text-secondary"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function FileDropZone({
  file,
  accept,
  prompt,
  onChange,
}: {
  file: File | null;
  accept: string;
  prompt: string;
  onChange: (file: File | null) => void;
}) {
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-2">
      <label className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border-strong bg-surface-alt py-10">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 18a4 4 0 0 1-1-7.9 5 5 0 0 1 9.6-2A4.5 4.5 0 0 1 17 18H7z" />
          <path d="M12 11v6M9.5 13.5L12 11l2.5 2.5" />
        </svg>
        <span className="text-[14px] font-bold text-text">{file ? file.name : prompt}</span>
        <input type="file" accept={accept} className="hidden" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      </label>
      <span className="text-[11.5px] text-text-muted">or</span>
      <GoogleDrivePickButton accept={accept} onPick={onChange} />
    </div>
  );
}

export function ExtractionNotice({ notice, report }: { notice: string | null; report?: ExtractionReport | null }) {
  if (!notice && !report) return null;
  return (
    <div className="flex flex-col gap-2">
      {notice && (
        <div className="flex items-start gap-2 rounded-lg border border-[#CFE1F2] bg-info-bg px-3.5 py-3 text-[13px] text-[#0F3A63]">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--color-primary)" strokeWidth="1.6" className="mt-0.5 shrink-0">
            <circle cx="10" cy="10" r="7.2" />
            <line x1="10" y1="9" x2="10" y2="14" />
          </svg>
          <span>{notice}</span>
        </div>
      )}
      <ExtractionReportPanel report={report} />
    </div>
  );
}

export function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>;
}

export function ConfirmActions({
  onCancel,
  onConfirm,
  saving,
  danger,
  disabled,
  savingLabel = "Saving...",
  label = "Confirm & Save",
  dangerLabel = "Save Anyway",
}: {
  onCancel: () => void;
  onConfirm: () => void;
  saving: boolean;
  danger?: boolean;
  disabled?: boolean;
  savingLabel?: string;
  label?: string;
  dangerLabel?: string;
}) {
  return (
    <div className="mt-2 flex justify-end gap-2.5">
      <button type="button" onClick={onCancel} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
        Cancel
      </button>
      <button
        onClick={onConfirm}
        disabled={saving || disabled}
        className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-60 ${danger ? "bg-danger" : "bg-primary"}`}
      >
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 10l4 4 8-8" />
        </svg>
        {saving ? savingLabel : danger ? dangerLabel : label}
      </button>
    </div>
  );
}

export function DuplicateCheckPanel({
  checked,
  checking,
  matches,
  onCheck,
  hint = "Run this before saving — it looks for a record that may already exist.",
}: {
  checked: boolean;
  checking: boolean;
  matches: DuplicateMatch[] | null;
  onCheck: () => void;
  hint?: string;
}) {
  const hasDuplicates = checked && matches && matches.length > 0;
  return (
    <div className="rounded-lg border border-border bg-surface-alt p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[13px] font-bold text-text">Duplicate Check</div>
        <button
          type="button"
          onClick={onCheck}
          disabled={checking}
          className="rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-xs font-bold text-text disabled:opacity-60"
        >
          {checking ? "Checking..." : "Check for Duplicates"}
        </button>
      </div>
      {!checked && <p className="text-xs text-text-muted">{hint}</p>}
      {checked && !hasDuplicates && <p className="text-xs font-semibold text-success">No matching records found. Safe to save.</p>}
      {hasDuplicates && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-bold text-danger">Possible duplicate — this looks like a record already saved:</p>
          {matches!.map((m) => (
            <div key={m.id} className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">
              {m.label}
              {m.meta ? ` · ${m.meta}` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ImportSummaryBar({ fileName, rowCount, invalidCount, onChooseDifferentFile }: { fileName: string; rowCount: number; invalidCount: number; onChooseDifferentFile: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-[13px] text-text-secondary">
        <b>{fileName}</b> — {rowCount} row{rowCount === 1 ? "" : "s"} found
        {invalidCount > 0 && <span className="ml-2 font-semibold text-danger">· {invalidCount} row{invalidCount === 1 ? "" : "s"} with errors</span>}
        . Review and edit before confirming.
      </div>
      <button onClick={onChooseDifferentFile} className="text-[12.5px] font-semibold text-primary">Choose a different file</button>
    </div>
  );
}
