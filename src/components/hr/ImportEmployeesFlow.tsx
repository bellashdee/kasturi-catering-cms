"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { bulkImportEmployees, type BulkEmployeeRow } from "@/lib/hr/actions";
import { Select } from "@/components/ui/Select";

type Company = { id: string; name: string };

const HEADER_MAP: Record<string, keyof BulkEmployeeRow> = {
  "full name": "fullName",
  name: "fullName",
  department: "department",
  dept: "department",
  position: "position",
  role: "position",
  "employment type": "employmentType",
  type: "employmentType",
  status: "status",
  "employment status": "status",
  "join date": "joinDate",
  "date joined": "joinDate",
  "ic/passport no": "icPassportNo",
  "ic number": "icPassportNo",
  "ic/passport": "icPassportNo",
  passport: "icPassportNo",
  phone: "phone",
  "phone number": "phone",
  email: "email",
  "e-mail": "email",
  nama: "fullName",
  "nama staff": "fullName",
  ic: "icPassportNo",
  "no ic": "icPassportNo",
  "no. ic": "icPassportNo",
  "ic no": "icPassportNo",
  "ic no.": "icPassportNo",
  "mobile no": "phone",
  "mobile no.": "phone",
  mobile: "phone",
  "no telefon": "phone",
  "no. telefon": "phone",
  "no tel": "phone",
  "start date": "joinDate",
  "tarikh start kerja": "joinDate",
  "tarikh mula kerja": "joinDate",
  jawatan: "position",
  "bank name": "bankName",
  bank: "bankName",
  "nama bank": "bankName",
  "bank a/c no": "bankAccountNo",
  "bank a/c no.": "bankAccountNo",
  "bank account": "bankAccountNo",
  "bank account no": "bankAccountNo",
  "account no": "bankAccountNo",
  "a/c no": "bankAccountNo",
  "no akaun": "bankAccountNo",
  "no. akaun": "bankAccountNo",
  "no kwsp": "epfNo",
  "no. kwsp": "epfNo",
  kwsp: "epfNo",
  "epf no": "epfNo",
  epf: "epfNo",
};

function normalizeRow(raw: Record<string, unknown>): BulkEmployeeRow {
  const row: BulkEmployeeRow = { fullName: "" };
  for (const [key, value] of Object.entries(raw)) {
    const mapped = HEADER_MAP[key.trim().toLowerCase()];
    if (mapped && value != null) {
      row[mapped] = String(value).trim();
    }
  }
  return row;
}

const cellClass = "w-full rounded border border-border-strong px-2 py-1 text-[12.5px] outline-none focus:border-primary";

export function ImportEmployeesFlow({
  companies,
  defaultCompanyId,
  canImportPrivate = false,
}: {
  companies: Company[];
  defaultCompanyId?: string;
  /** Super Admin / Company Admin only: bank and KWSP columns are read and saved. */
  canImportPrivate?: boolean;
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [rows, setRows] = useState<BulkEmployeeRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [privateSaved, setPrivateSaved] = useState(0);

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

      setRows(raw.map(normalizeRow).map((r) => (canImportPrivate ? r : { ...r, bankName: undefined, bankAccountNo: undefined, epfNo: undefined })));
    } catch {
      setError("Couldn't read that file. Make sure it's a valid .xlsx, .xls or .csv file.");
    }
  }

  function updateCell(index: number, field: keyof BulkEmployeeRow, value: string) {
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
      const { inserted, privateSaved: saved } = await bulkImportEmployees(companyId, rows);
      setPrivateSaved(saved ?? 0);
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
        <div className="text-lg font-bold text-text">{result} employee{result === 1 ? "" : "s"} imported</div>
        {privateSaved > 0 && <div className="text-[13px] text-text-secondary">Bank and KWSP details saved for {privateSaved}.</div>}
        <button onClick={() => router.push("/hr")} className="mt-2 rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white">
          Back to Employee Database
        </button>
      </div>
    );
  }

  if (!rows) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-[12.5px] font-semibold text-text-secondary">Company *</label>
          <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="mt-1.5 h-10 w-full max-w-xs rounded-lg border border-border-strong px-3 text-sm outline-none">
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
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
          <span className="text-[12.5px] text-text-muted">Columns like Name, IC, Mobile No, Email, Start Date, Position{canImportPrivate ? ", Bank, A/C No, KWSP" : ""} are auto-detected</span>
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
              <th className="px-3 py-2">IC Number / Passport No.</th>
              <th className="px-3 py-2">Mobile No.</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Start Date</th>
              <th className="px-3 py-2">Position</th>
              <th className="px-3 py-2">Department</th>
              {canImportPrivate && <th className="px-3 py-2">Bank Name</th>}
              {canImportPrivate && <th className="px-3 py-2">Bank A/C No.</th>}
              {canImportPrivate && <th className="px-3 py-2">KWSP No.</th>}
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-3 py-1.5"><input className={cellClass} value={row.fullName} onChange={(e) => updateCell(i, "fullName", e.target.value)} /></td>
                <td className="px-3 py-1.5"><input className={cellClass} value={row.icPassportNo ?? ""} onChange={(e) => updateCell(i, "icPassportNo", e.target.value)} /></td>
                <td className="px-3 py-1.5"><input className={cellClass} value={row.phone ?? ""} onChange={(e) => updateCell(i, "phone", e.target.value)} /></td>
                <td className="px-3 py-1.5"><input className={cellClass} value={row.email ?? ""} onChange={(e) => updateCell(i, "email", e.target.value)} /></td>
                <td className="px-3 py-1.5"><input className={cellClass} value={row.joinDate ?? ""} onChange={(e) => updateCell(i, "joinDate", e.target.value)} placeholder="YYYY-MM-DD" /></td>
                <td className="px-3 py-1.5"><input className={cellClass} value={row.position ?? ""} onChange={(e) => updateCell(i, "position", e.target.value.toUpperCase())} /></td>
                <td className="px-3 py-1.5"><input className={cellClass} value={row.department ?? ""} onChange={(e) => updateCell(i, "department", e.target.value)} /></td>
                {canImportPrivate && <td className="px-3 py-1.5"><input className={cellClass} value={row.bankName ?? ""} onChange={(e) => updateCell(i, "bankName", e.target.value)} /></td>}
                {canImportPrivate && <td className="px-3 py-1.5"><input className={cellClass} value={row.bankAccountNo ?? ""} onChange={(e) => updateCell(i, "bankAccountNo", e.target.value)} /></td>}
                {canImportPrivate && <td className="px-3 py-1.5"><input className={cellClass} value={row.epfNo ?? ""} onChange={(e) => updateCell(i, "epfNo", e.target.value)} /></td>}
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
          {saving ? "Importing..." : `Confirm & Import ${rows.length} Employee(s)`}
        </button>
      </div>
    </div>
  );
}
