"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { bulkImportLeads, type BulkLeadRow } from "@/lib/marketing/actions";

type Company = { id: string; name: string };

const HEADER_MAP: Record<string, keyof BulkLeadRow> = {
  name: "name",
  "full name": "name",
  phone: "phone",
  "phone number": "phone",
  email: "email",
  source: "source",
  notes: "notes",
  remarks: "notes",
};

function normalizeRow(raw: Record<string, unknown>): BulkLeadRow {
  const row: BulkLeadRow = { name: "" };
  for (const [key, value] of Object.entries(raw)) {
    const mapped = HEADER_MAP[key.trim().toLowerCase()];
    if (mapped && value != null) row[mapped] = String(value).trim();
  }
  return row;
}

const cellClass = "w-full rounded border border-border-strong px-2 py-1 text-[12.5px] outline-none focus:border-primary";

export function ImportLeadsFlow({ companies, defaultCompanyId }: { companies: Company[]; defaultCompanyId?: string }) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [rows, setRows] = useState<BulkLeadRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<number | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      if (raw.length === 0) {
        setError("That file doesn't have any rows we could read.");
        return;
      }
      setRows(raw.map(normalizeRow));
    } catch {
      setError("Couldn't read that file. Make sure it's a valid .xlsx, .xls or .csv file.");
    }
  }

  function updateCell(index: number, field: keyof BulkLeadRow, value: string) {
    setRows((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function removeRow(index: number) {
    setRows((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  }

  async function handleConfirm() {
    if (!rows || !companyId) return;
    setSaving(true);
    setError(null);
    try {
      const { inserted } = await bulkImportLeads(companyId, rows);
      setResult(inserted);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setSaving(false);
    }
  }

  if (result !== null) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-success-bg">
          <svg width="26" height="26" viewBox="0 0 20 20" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 10l4 4 8-8" />
          </svg>
        </div>
        <div className="text-lg font-bold text-text">{result} lead{result === 1 ? "" : "s"} imported</div>
        <button onClick={() => router.push("/marketing/leads")} className="mt-2 rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white">
          Back to Leads
        </button>
      </div>
    );
  }

  if (!rows) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-[12.5px] font-semibold text-text-secondary">Company *</label>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="mt-1.5 h-10 w-full max-w-xs rounded-lg border border-border-strong px-3 text-sm outline-none">
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border-strong bg-surface-alt py-14 text-center">
          <svg width="28" height="28" viewBox="0 0 20 20" fill="none" stroke="var(--color-accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="14" height="14" rx="1.5" />
            <line x1="3" y1="8" x2="17" y2="8" />
            <line x1="3" y1="13" x2="17" y2="13" />
            <line x1="9" y1="3" x2="9" y2="17" />
          </svg>
          <span className="text-[14px] font-bold text-text">Click to choose an Excel or CSV file</span>
          <span className="text-[12.5px] text-text-muted">Columns like Name, Phone, Email, Source are auto-detected</span>
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
        </label>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-[13px] text-text-secondary">
          <b>{fileName}</b> — {rows.length} row{rows.length === 1 ? "" : "s"} found. Review and edit before confirming.
        </div>
        <button onClick={() => setRows(null)} className="text-[12.5px] font-semibold text-primary">Choose a different file</button>
      </div>

      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 bg-surface-alt">
            <tr className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-3 py-1.5"><input className={cellClass} value={row.name} onChange={(e) => updateCell(i, "name", e.target.value)} /></td>
                <td className="px-3 py-1.5"><input className={cellClass} value={row.phone ?? ""} onChange={(e) => updateCell(i, "phone", e.target.value)} /></td>
                <td className="px-3 py-1.5"><input className={cellClass} value={row.email ?? ""} onChange={(e) => updateCell(i, "email", e.target.value)} /></td>
                <td className="px-3 py-1.5"><button onClick={() => removeRow(i)} className="text-xs font-semibold text-danger">Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-2.5">
        <button onClick={() => setRows(null)} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-text">
          Cancel
        </button>
        <button onClick={handleConfirm} disabled={saving || rows.length === 0} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {saving ? "Importing..." : `Confirm & Import ${rows.length} Lead${rows.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}
