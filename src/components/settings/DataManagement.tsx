"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { untyped } from "@/lib/kitchenPurchase/shared";
import { useI18n } from "@/components/i18n/I18nProvider";
import { SettingsDisclosure, SettingsRow } from "@/components/settings/SettingsList";
import { buildWorkbook, readWorkbook, type Row, type TableInfo } from "@/lib/backup/workbook";

/**
 * Settings → Data Management (Super Admin only).
 * Backup: every table of the system (175, the ones with a key) as one Excel file, one sheet per table, read and written in this browser.
 * Restore: a backup file is read here; the records that are missing now are listed first; on confirm only those are put back (a record that
 * exists is never changed). The database functions (backup_tables, backup_rows, restore_missing, restore_insert) check the Super Admin.
 * Requests stay small (the browser reaches the database through this site, which takes at most 4.5 MB per request).
 */

type Plan = { table: string; rows: Row[]; dependsOn: string[] }[];

const PAGE = 250;
const BYTES_PER_REQUEST = 900_000;

const label = (table: string) => table.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Rows in groups small enough for one request (a very large row goes alone). */
function chunks(rows: Row[]): Row[][] {
  const out: Row[][] = [];
  let cur: Row[] = [];
  let size = 0;
  for (const r of rows) {
    const s = JSON.stringify(r).length;
    if (cur.length > 0 && (size + s > BYTES_PER_REQUEST || cur.length >= PAGE)) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(r);
    size += s;
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

/** Parents before children (a table after the tables it points to); tables that point at each other keep the file's order. */
function parentsFirst(plan: Plan): Plan {
  const left = new Map(plan.map((p) => [p.table, p]));
  const out: Plan = [];
  while (left.size > 0) {
    const ready = [...left.values()].filter((p) => p.dependsOn.every((d) => !left.has(d)));
    const take = ready.length > 0 ? ready : [left.values().next().value!];
    for (const p of take) {
      out.push(p);
      left.delete(p.table);
    }
  }
  return out;
}

function stamp() {
  const d = new Date(Date.now() + 8 * 3600_000).toISOString(); // Malaysia time
  return `${d.slice(0, 10)} ${d.slice(11, 13)}${d.slice(14, 16)}`;
}

export function DataManagement() {
  const { t } = useI18n();
  const [backupNote, setBackupNote] = useState("");
  const [backingUp, setBackingUp] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [checking, setChecking] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreNote, setRestoreNote] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [result, setResult] = useState<{ inserted: number; failed: { table: string; error: string }[] } | null>(null);

  async function backup() {
    setBackingUp(true);
    setBackupNote(t("Reading the list of tables..."));
    try {
      const db = untyped(createClient());
      const { data: tables, error } = await db.rpc("backup_tables");
      if (error) throw new Error(error.message);
      const list = (tables ?? []) as (TableInfo & { row_count: number })[];
      const total = list.reduce((sum, x) => sum + Number(x.row_count), 0);
      const all: { info: TableInfo; rows: Row[] }[] = [];
      let read = 0;
      for (const info of list) {
        const rows: Row[] = [];
        for (let offset = 0; ; offset += PAGE) {
          const { data, error: e } = await db.rpc("backup_rows", { p_table: info.table_name, p_offset: offset, p_limit: PAGE });
          if (e) throw new Error(`${info.table_name}: ${e.message}`);
          const page = (data ?? []) as Row[];
          rows.push(...page);
          read += page.length;
          setBackupNote(`${t("Reading records...")} ${read.toLocaleString()} / ${total.toLocaleString()}`);
          if (page.length < PAGE) break;
        }
        all.push({ info, rows });
      }
      const XLSX = await import("xlsx");
      const { wb } = buildWorkbook(XLSX, all, stamp());
      setBackupNote(t("Writing the Excel file..."));
      XLSX.writeFile(wb, `CMS Backup ${stamp()}.xlsx`, { compression: true });
      setBackupNote(`${t("Backup downloaded:")} ${list.length} ${t("tables")}, ${read.toLocaleString()} ${t("records")}.`);
    } catch (e) {
      setBackupNote(`${t("Backup failed:")} ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBackingUp(false);
    }
  }

  async function check() {
    if (!file) return;
    setChecking(true);
    setPlan(null);
    setResult(null);
    setRestoreNote(t("Reading the backup file..."));
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer());
      const { index, rowsOf } = readWorkbook(XLSX, wb);

      const db = untyped(createClient());
      const { data: current, error } = await db.rpc("backup_tables");
      if (error) throw new Error(error.message);
      const known = new Set(((current ?? []) as TableInfo[]).map((x) => x.table_name));

      const found: Plan = [];
      let checked = 0;
      const total = index.reduce((s, x) => s + Number(x.Records || 0), 0);
      for (const entry of index) {
        if (!known.has(entry.Table) || !wb.Sheets[entry.Sheet] || Number(entry.Records) === 0) continue;
        const rows = rowsOf(entry);
        const missing: Row[] = [];
        for (const part of chunks(rows)) {
          const { data, error: e } = await db.rpc("restore_missing", { p_table: entry.Table, p_rows: part });
          if (e) throw new Error(`${entry.Table}: ${e.message}`);
          missing.push(...((data ?? []) as Row[]));
          checked += part.length;
          setRestoreNote(`${t("Comparing with the system...")} ${checked.toLocaleString()} / ${total.toLocaleString()}`);
        }
        if (missing.length > 0) found.push({ table: entry.Table, rows: missing, dependsOn: String(entry.DependsOn).split(",").filter(Boolean) });
      }
      setPlan(found);
      setRestoreNote(found.length === 0 ? t("Nothing is missing: every record in this backup is in the system.") : "");
    } catch (e) {
      setRestoreNote(`${t("The file could not be checked:")} ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setChecking(false);
    }
  }

  async function restore() {
    if (!plan || plan.length === 0) return;
    const count = plan.reduce((s, p) => s + p.rows.length, 0);
    if (!window.confirm(t("Put back {0} missing records? Records that exist now are not changed.").replace("{0}", count.toLocaleString()))) return;
    setRestoring(true);
    setRestoreNote(t("Putting the missing records back..."));
    try {
      const db = untyped(createClient());
      let pending = parentsFirst(plan);
      let inserted = 0;
      let failed: { table: string; row: Row; error: string }[] = [];
      // up to three rounds: a record whose parent record comes back later in the same round is tried again
      for (let round = 1; round <= 3 && pending.length > 0; round++) {
        failed = [];
        for (const p of pending) {
          for (const part of chunks(p.rows)) {
            const { data, error } = await db.rpc("restore_insert", { p_table: p.table, p_rows: part });
            if (error) throw new Error(`${p.table}: ${error.message}`);
            const res = data as { inserted: number; failed: { row: Row; error: string }[] };
            inserted += res.inserted;
            failed.push(...res.failed.map((f) => ({ table: p.table, row: f.row, error: f.error })));
            setRestoreNote(`${t("Putting the missing records back...")} ${inserted.toLocaleString()} / ${count.toLocaleString()}`);
          }
        }
        const byTable = new Map<string, Row[]>();
        for (const f of failed) byTable.set(f.table, [...(byTable.get(f.table) ?? []), f.row]);
        pending = pending.filter((p) => byTable.has(p.table)).map((p) => ({ ...p, rows: byTable.get(p.table)! }));
      }
      setResult({ inserted, failed: failed.map((f) => ({ table: f.table, error: f.error })) });
      setPlan(null);
      setRestoreNote("");
    } catch (e) {
      setRestoreNote(`${t("Restore stopped:")} ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRestoring(false);
    }
  }

  const button = "inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-[14px] font-semibold disabled:opacity-55";
  const missingTotal = plan?.reduce((s, p) => s + p.rows.length, 0) ?? 0;

  return (
    <>
      <SettingsRow icon="database" label="Backup" hint="Download every record of the system as one Excel file">
        <button type="button" onClick={backup} disabled={backingUp} className={`${button} bg-primary text-white`}>
          {backingUp ? "Working..." : "Download backup"}
        </button>
      </SettingsRow>
      {backupNote && <div role="status" className="px-4 py-3 text-[13.5px] text-text-secondary">{backupNote}</div>}
      <SettingsDisclosure icon="database" label="Restore" hint="Put back the records that are missing, from a backup file">
        <div className="flex flex-col gap-3">
          <p className="text-[13.5px] text-text-secondary">
            Only records that are missing now are put back. A record that is in the system now is never changed or replaced. You see the list before anything is saved.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-border-strong bg-surface px-4 text-[14px] font-semibold text-text hover:bg-surface-alt">
              <input
                type="file"
                accept=".xlsx"
                className="sr-only"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setPlan(null);
                  setResult(null);
                  setRestoreNote("");
                }}
              />
              Choose backup file (.xlsx)
            </label>
            {file && <span className="min-w-0 break-all text-[13px] text-text-muted">{file.name}</span>}
            <button type="button" onClick={check} disabled={!file || checking || restoring} className={`${button} border border-border-strong bg-surface text-text`}>
              {checking ? "Checking..." : "Check what is missing"}
            </button>
          </div>
          {restoreNote && <div role="status" className="text-[13.5px] text-text-secondary">{restoreNote}</div>}
          {plan && plan.length > 0 && (
            <div className="rounded-xl border border-border bg-surface">
              <div className="border-b border-border px-4 py-2.5 text-[14px] font-semibold text-text">{`Missing now: ${missingTotal.toLocaleString()} records in ${plan.length} tables`}</div>
              <ul className="max-h-72 divide-y divide-border overflow-y-auto">
                {plan.map((p) => (
                  <li key={p.table} className="flex items-center justify-between gap-3 px-4 py-2 text-[13.5px]">
                    <span className="text-text">{label(p.table)}</span>
                    <span className="tabular-nums text-text-secondary">{p.rows.length.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-border px-4 py-3">
                <button type="button" onClick={restore} disabled={restoring} className={`${button} bg-primary text-white`}>
                  {restoring ? "Restoring..." : `Put back ${missingTotal.toLocaleString()} missing records`}
                </button>
              </div>
            </div>
          )}
          {result && (
            <div role="status" className="rounded-xl border border-border bg-surface px-4 py-3 text-[13.5px]">
              <div className="font-semibold text-success">{`Put back: ${result.inserted.toLocaleString()} records.`}</div>
              {result.failed.length > 0 && (
                <div className="mt-1 text-warning">
                  {`Not put back: ${result.failed.length} records.`}
                  <ul className="mt-1 list-disc pl-5 text-text-secondary">
                    {result.failed.slice(0, 8).map((f, i) => (
                      <li key={i}>{`${label(f.table)}: ${f.error}`}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </SettingsDisclosure>
    </>
  );
}
