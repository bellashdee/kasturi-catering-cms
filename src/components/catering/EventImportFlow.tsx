"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";
import { Select } from "@/components/ui/Select";
import { StatusBadge } from "@/components/StatusBadge";
import { checkEventImport, confirmEventImport } from "@/lib/catering/eventImportActions";
import {
  IMPORT_FIELDS,
  MAX_IMPORT_ROWS,
  cellText,
  companyOfCode,
  emptyImportRow,
  fieldOfHeader,
  findHeaderRow,
  parseDate,
  type CheckedRow,
  type ImportAction,
  type ImportDetail,
  type ImportField,
  type ImportRow,
} from "@/lib/catering/eventImport";

type Company = { id: string; name: string };
type Sheet = { name: string; rows: unknown[][] };

const cellClass = "w-full min-w-[7rem] rounded border border-border-strong px-2 py-1 text-[12.5px] outline-none focus:border-primary";
const btn = "rounded-lg border border-border-strong bg-surface px-4 py-2 text-[13px] font-semibold text-text disabled:opacity-60";
const primary = "rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60";

const KIND: Record<CheckedRow["kind"], { label: string; tone: "success" | "info" | "warning" | "danger" }> = {
  new: { label: "New event", tone: "success" },
  update: { label: "Existing Event ID", tone: "info" },
  duplicate: { label: "Possible duplicate", tone: "warning" },
  error: { label: "Cannot import", tone: "danger" },
};

/** This year in Malaysia: the year given to dates written without one ("1-Nov"). */
const malaysiaYear = () => Number(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).slice(0, 4));

/**
 * The rows of a sheet under its header row, by the column mapping:
 * - rows with neither an event name nor a date are left out (blank lines, notes under the table);
 * - a date without a year takes the year chosen; an empty date takes the date of the row above (a merged date cell);
 * - when a company code column (K / SSC) is chosen, the rows of the other companies are left out.
 */
function rowsOf(sheet: Sheet, headerIndex: number, mapping: (ImportField | "")[], year: number, companyName: string) {
  const notes: string[] = [];
  let filled = 0;
  let otherCompany = 0;
  let lastDate = "";
  const rows: ImportRow[] = [];
  for (const cells of sheet.rows.slice(headerIndex + 1)) {
    const row = emptyImportRow();
    mapping.forEach((field, col) => {
      if (field && !row[field]) row[field] = cellText(cells[col]);
    });
    if (!row.eventName.trim() && !row.eventDate.trim()) continue;
    if (row.eventDate.trim()) {
      const date = parseDate(row.eventDate, year);
      if (date) row.eventDate = date;
      lastDate = row.eventDate;
    } else if (lastDate) {
      row.eventDate = lastDate;
      filled++;
    }
    const company = row.companyCode.trim() ? companyOfCode(row.companyCode) : null;
    if (company && !companyName.toLowerCase().includes(company.toLowerCase())) {
      otherCompany++;
      continue;
    }
    rows.push(row);
  }
  if (filled) notes.push(`${filled} row(s) had no date and took the date of the row above (a merged date cell). Check them in the list.`);
  if (otherCompany) notes.push(`${otherCompany} row(s) of another company (by the Com column) were left out. Choose that company to import them.`);
  return { rows, notes };
}

/**
 * Importing confirmed events from Excel (only Ms. Nabilah, Mr. Adlan and Ms. Penny): read the file, match the columns, check every row
 * against the saved events, correct what needs correcting, choose Import / Update / Skip per row, and only then CONFIRM IMPORT.
 */
export function EventImportFlow({ companies, defaultCompanyId }: { companies: Company[]; defaultCompanyId?: string }) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? "");
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerIndex, setHeaderIndex] = useState(-1);
  const [mapping, setMapping] = useState<(ImportField | "")[]>([]);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [checked, setChecked] = useState<CheckedRow[] | null>(null);
  const [actions, setActions] = useState<ImportAction[]>([]);
  const [busy, setBusy] = useState<"" | "checking" | "importing">("");
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [year, setYear] = useState(malaysiaYear);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number; failed: number; details: ImportDetail[] } | null>(null);

  const sheet = sheets[sheetIndex];

  function pickSheet(list: Sheet[], index: number) {
    const s = list[index];
    const h = findHeaderRow(s.rows);
    setSheetIndex(index);
    setHeaderIndex(h);
    setMapping(h >= 0 ? s.rows[h].map((c) => fieldOfHeader(String(c ?? ""))) : []);
    setRows(null);
    setChecked(null);
    if (h < 0) setError(`No header row found on the sheet "${s.name}": the first rows must name the columns (Event Name, Event Date, Customer, Pax ...).`);
    else setError(null);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setResult(null);
    const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
    try {
      let list: Sheet[];
      if (isPdf) {
        const { readPdfTable } = await import("@/lib/catering/pdfTable");
        const table = await readPdfTable(await file.arrayBuffer());
        if (table.length < 2) {
          setError("No event table could be read from that PDF. A scanned PDF (a photo of the page) has no text: use the Excel file instead.");
          return;
        }
        list = [{ name: "PDF", rows: table }];
      } else {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
        list = workbook.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: "", raw: true }) })).filter((s) => s.rows.length > 0);
      }
      if (list.length === 0) {
        setError("That file has no rows that could be read.");
        return;
      }
      setFileName(file.name);
      setSheets(list);
      // the first sheet that has a header row
      const first = Math.max(0, list.findIndex((s) => findHeaderRow(s.rows) >= 0));
      pickSheet(list, first);
    } catch {
      setError(isPdf ? "Could not read that PDF. Make sure it is not password protected, or use the Excel file instead." : "Could not read that file. Make sure it is a valid .xlsx, .xls, .csv or .pdf file.");
    }
  }

  async function check(list: ImportRow[]) {
    if (list.length === 0) {
      setError("No event rows were found under the header row.");
      return;
    }
    if (list.length > MAX_IMPORT_ROWS) {
      setError(`At most ${MAX_IMPORT_ROWS} rows in one import. Split the file.`);
      return;
    }
    setBusy("checking");
    setError(null);
    const r = await checkEventImport(companyId, list);
    setBusy("");
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setRows(list);
    setChecked(r.rows);
    setActions(r.rows.map((x) => x.action));
  }

  function edit(i: number, field: ImportField, value: string) {
    setRows((prev) => (prev ? prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)) : prev));
  }

  async function confirm() {
    if (!rows || !checked) return;
    const doing = actions.filter((a) => a !== "skip").length;
    if (doing === 0) {
      setError("Every row is set to Skip: there is nothing to import.");
      return;
    }
    if (!window.confirm(`Import ${actions.filter((a) => a === "create").length} new event(s) and update ${actions.filter((a) => a === "update").length} existing event(s)?`)) return;
    setBusy("importing");
    setError(null);
    const r = await confirmEventImport({ companyId, fileName, sheetName: sheet?.name, rows, actions });
    setBusy("");
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setResult(r);
    router.refresh();
  }

  function checkSheet() {
    if (!sheet) return;
    const out = rowsOf(sheet, headerIndex, mapping, year, companies.find((c) => c.id === companyId)?.name ?? "");
    setNotes(out.notes);
    void check(out.rows);
  }

  function reset() {
    setNotes([]);
    setSheets([]);
    setRows(null);
    setChecked(null);
    setResult(null);
    setFileName("");
    setError(null);
  }

  if (result) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-success/30 bg-success-bg px-5 py-4 text-[13.5px] text-success">
          <div className="text-[16px] font-extrabold">Import done</div>
          {result.created} new event(s) created · {result.updated} updated · {result.skipped} skipped{result.failed > 0 ? ` · ${result.failed} could not be saved` : ""}. The events are on the calendar.
        </div>
        <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
          <table className="w-full text-left text-[12.5px]">
            <thead className="sticky top-0 bg-surface-alt text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-3 py-2">Row</th>
                <th className="px-3 py-2">Result</th>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Event ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.details.map((d) => (
                <tr key={d.line} className="align-top">
                  <td className="px-3 py-2">{d.line}</td>
                  <td className="px-3 py-2">
                    {d.action === "create" ? <StatusBadge tone="success">Created</StatusBadge> : d.action === "update" ? <StatusBadge tone="info">Updated</StatusBadge> : d.action === "error" ? <StatusBadge tone="danger">Not saved</StatusBadge> : <StatusBadge tone="neutral">Skipped</StatusBadge>}
                    {d.message && <div className="mt-1 text-[11.5px] text-danger">{d.message}</div>}
                  </td>
                  <td className="px-3 py-2">{d.eventId && d.action !== "error" ? <Link href={`/catering/${d.eventId}`} className="font-semibold text-primary">{d.name}</Link> : d.name}</td>
                  <td className="px-3 py-2">{d.date}</td>
                  <td className="px-3 py-2">{d.reference ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2.5">
          <button onClick={reset} className={btn}>Import another file</button>
          <Link href="/catering/calendar" className={primary}>Open the calendar</Link>
        </div>
      </div>
    );
  }

  if (sheets.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-[12.5px] font-semibold text-text-secondary">Company *</label>
          <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="mt-1.5 h-10 w-full max-w-xs rounded-lg border border-border-strong px-3 text-sm outline-none">
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border-strong bg-surface-alt px-4 py-14 text-center">
          <span className="text-[14px] font-bold text-text">Click to choose the confirmed events file (Excel or PDF)</span>
          <span className="max-w-xl text-[12.5px] text-text-muted">
            Columns are found by their header in any order: Event ID, Customer, Event Name, Event Date, Start Time, End Time, Venue, Event Address, Pax, Meal Type,
            Service Type, Confirmed Menu, Sales Agent, AutoCount Quotation No., AutoCount Invoice No., Event Status, Remarks, Revenue, Com (K / SSC). A PDF event list
            must be the PDF made from Excel or Word (not a scanned page). Nothing is saved until you press CONFIRM IMPORT.
          </span>
          <input type="file" accept=".xlsx,.xls,.csv,.pdf,application/pdf" className="hidden" onChange={handleFile} />
        </label>
      </div>
    );
  }

  const mappedFields = new Set(mapping.filter(Boolean));
  const missingRequired = IMPORT_FIELDS.filter((f) => f.required && !mappedFields.has(f.key));
  const counts = checked ? { create: actions.filter((a) => a === "create").length, update: actions.filter((a) => a === "update").length, skip: actions.filter((a) => a === "skip").length } : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[13px] text-text-secondary">
          <b>{fileName}</b> · {companies.find((c) => c.id === companyId)?.name}
        </div>
        <button onClick={reset} className="text-[12.5px] font-semibold text-primary">Choose a different file</button>
      </div>

      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}
      {notes.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-[12.5px] text-warning">
          {notes.map((n) => <div key={n}>{n}</div>)}
        </div>
      )}

      {!checked && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-end gap-4">
            {sheets.length > 1 && (
              <label className="text-[12.5px] font-semibold text-text-secondary">
                Worksheet
                <Select value={String(sheetIndex)} onChange={(e) => pickSheet(sheets, Number(e.target.value))} className="mt-1.5 block h-9 rounded-lg border border-border-strong px-2 text-sm">
                  {sheets.map((s, i) => <option key={s.name} value={i}>{s.name} ({s.rows.length} rows)</option>)}
                </Select>
              </label>
            )}
            <label className="text-[12.5px] font-semibold text-text-secondary">
              Year for dates without a year
              <input type="number" min={2020} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value) || malaysiaYear())} className="mt-1.5 block h-9 w-28 rounded-lg border border-border-strong px-2 text-sm" />
            </label>
            {headerIndex >= 0 && <div className="text-[12.5px] text-text-muted">Header found on row {headerIndex + 1}. Check which column is which:</div>}
          </div>
          {headerIndex >= 0 && sheet && (
            <>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {sheet.rows[headerIndex].map((h, col) => (
                  <label key={col} className="flex items-center gap-2 text-[12.5px]">
                    <span className="w-40 truncate font-semibold text-text" title={String(h ?? "")}>{String(h ?? "") || `Column ${col + 1}`}</span>
                    <Select value={mapping[col] ?? ""} onChange={(e) => setMapping((m) => m.map((x, idx) => (idx === col ? (e.target.value as ImportField | "") : x)))} className="h-8 flex-1 rounded border border-border-strong px-2 text-[12.5px]">
                      <option value="">— not imported —</option>
                      {IMPORT_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </Select>
                  </label>
                ))}
              </div>
              {missingRequired.length > 0 && <p className="mt-2 text-[12.5px] text-danger">Choose the column of: {missingRequired.map((f) => f.label).join(", ")}.</p>}
              <button disabled={busy !== "" || missingRequired.length > 0} onClick={checkSheet} className={`${primary} mt-3`}>
                {busy === "checking" ? "Checking..." : "Check the rows"}
              </button>
            </>
          )}
        </div>
      )}

      {checked && rows && counts && (
        <>
          <div className="flex flex-wrap gap-2 text-[12.5px]">
            <StatusBadge tone="success">{checked.filter((c) => c.kind === "new").length} new</StatusBadge>
            <StatusBadge tone="info">{checked.filter((c) => c.kind === "update").length} existing Event ID</StatusBadge>
            <StatusBadge tone="warning">{checked.filter((c) => c.kind === "duplicate").length} possible duplicate</StatusBadge>
            <StatusBadge tone="danger">{checked.filter((c) => c.kind === "error").length} cannot import</StatusBadge>
            <span className="text-text-muted">Correct a cell and press &quot;Check again&quot;. A possible duplicate is skipped unless you choose &quot;Import as new&quot;.</span>
          </div>

          <div className="max-h-[560px] overflow-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-left text-[12.5px]">
              <thead className="sticky top-0 z-10 bg-surface-alt text-[11px] font-bold uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-2 py-2">Row</th>
                  <th className="px-2 py-2">Check</th>
                  <th className="px-2 py-2">Action</th>
                  {IMPORT_FIELDS.map((f) => <th key={f.key} className="px-2 py-2">{f.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {checked.map((c, i) => (
                  <tr key={i} className="border-t border-border align-top">
                    <td className="px-2 py-1.5 font-semibold">{i + 1}</td>
                    <td className="min-w-[16rem] px-2 py-1.5">
                      <StatusBadge tone={KIND[c.kind].tone}>{KIND[c.kind].label}</StatusBadge>
                      {c.match && <div className="mt-1 text-[11.5px] text-text-secondary">{c.match.reference ?? ""} {c.match.name} · {c.match.date}{c.match.customer ? ` · ${c.match.customer}` : ""}</div>}
                      {c.customerIsNew && c.kind !== "error" && <div className="mt-1 text-[11.5px] text-warning">New customer — will be created</div>}
                      {c.errors.map((m) => <div key={m} className="mt-1 text-[11.5px] text-danger">{m}</div>)}
                      {c.warnings.map((m) => <div key={m} className="mt-1 text-[11.5px] text-text-muted">{m}</div>)}
                      {c.changes.length > 0 && (
                        <ul className="mt-1 text-[11.5px]">
                          {c.changes.map((ch) => (
                            <li key={ch.field}>
                              <span className="font-semibold">{ch.field}:</span> <span className="text-text-muted line-through">{ch.from}</span> → <span className="font-semibold text-text">{ch.to}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <Select
                        value={actions[i]}
                        disabled={c.kind === "error"}
                        onChange={(e) => setActions((a) => a.map((x, idx) => (idx === i ? (e.target.value as ImportAction) : x)))}
                        className="h-8 rounded border border-border-strong px-1 text-[12.5px]"
                      >
                        {c.kind === "update" ? <option value="update">Update existing</option> : <option value="create">{c.kind === "duplicate" ? "Import as new" : "Import new"}</option>}
                        <option value="skip">Skip</option>
                      </Select>
                    </td>
                    {IMPORT_FIELDS.map((f) => (
                      <td key={f.key} className="px-2 py-1.5">
                        {f.key === "menu" || f.key === "remarks" ? (
                          <textarea className={`${cellClass} h-16 resize-y`} value={rows[i][f.key]} onChange={(e) => edit(i, f.key, e.target.value)} />
                        ) : (
                          <input className={cellClass} value={rows[i][f.key]} onChange={(e) => edit(i, f.key, e.target.value)} />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[13px] text-text-secondary">
              {counts.create} to import · {counts.update} to update · {counts.skip} to skip
            </div>
            <div className="flex gap-2.5">
              <button onClick={() => void check(rows)} disabled={busy !== ""} className={btn}>{busy === "checking" ? "Checking..." : "Check again"}</button>
              <button onClick={() => { setChecked(null); setRows(null); setNotes([]); }} disabled={busy !== ""} className={btn}>Back to columns</button>
              <button onClick={() => void confirm()} disabled={busy !== "" || counts.create + counts.update === 0} className={primary}>
                {busy === "importing" ? "Importing..." : "CONFIRM IMPORT"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
