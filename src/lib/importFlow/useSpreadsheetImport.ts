"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import type { FieldDef } from "@/lib/importFlow/types";

export type ColumnMapping = Record<string, string>; // source header -> target field key ("" = ignore)
export type ImportStep = "pick" | "map" | "preview";

const IGNORE = "";

/**
 * The reusable engine behind every Excel/CSV import in the system:
 *   Upload -> Document Detection (it's a spreadsheet) -> Map Columns -> Preview
 *   -> Validate -> Show Errors -> Confirm -> Import.
 *
 * Column mapping is a real, visible step — every detected header gets a
 * best-guess target field (via label/key match or a caller-supplied alias
 * list), but the user sees and can correct the mapping before any row is
 * previewed, rather than fields silently landing in the wrong place.
 */
export function useSpreadsheetImport(fields: FieldDef[], headerAliases: Record<string, string> = {}) {
  const [step, setStep] = useState<ImportStep>("pick");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "", raw: false });

      if (grid.length === 0) {
        setError("That file doesn't have any rows we could read.");
        return;
      }

      const [headerRow, ...body] = grid;
      const cleanedHeaders = headerRow.map((h) => String(h ?? "").trim());
      const nonEmptyBody = body.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));

      const guessedMapping: ColumnMapping = {};
      for (const h of cleanedHeaders) {
        const normalized = h.toLowerCase().trim();
        const alias = headerAliases[normalized];
        const byLabelOrKey = fields.find((f) => f.label.toLowerCase() === normalized || f.key.toLowerCase() === normalized);
        guessedMapping[h] = alias ?? byLabelOrKey?.key ?? IGNORE;
      }

      setFileName(file.name);
      setHeaders(cleanedHeaders);
      setRawRows(nonEmptyBody);
      setMapping(guessedMapping);
      setStep("map");
    } catch {
      setError("Couldn't read that file. Make sure it's a valid .xlsx, .xls or .csv file.");
    }
  }

  function setColumnMapping(header: string, targetKey: string) {
    setMapping((prev) => ({ ...prev, [header]: targetKey }));
  }

  /** Applies the confirmed mapping and moves into the editable Preview step. */
  function confirmMapping() {
    const mappedRows = rawRows.map((r) => {
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        const targetKey = mapping[h];
        if (targetKey) row[targetKey] = String(r[i] ?? "").trim();
      });
      return row;
    });
    setRows(mappedRows);
    setStep("preview");
  }

  function updateCell(index: number, key: string, value: string) {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  /** Validation + Show Errors: one required-field pass per row, visible per row. */
  const rowErrors: string[][] = rows.map((row) => {
    const errs: string[] = [];
    for (const f of fields) {
      if (f.required && !row[f.key]?.trim()) errs.push(`${f.label} is required`);
    }
    return errs;
  });
  const invalidCount = rowErrors.filter((e) => e.length > 0).length;
  const validRowCount = rows.length - invalidCount;

  async function confirmImport<T>(onImport: (validRows: Record<string, string>[]) => Promise<T>): Promise<T | null> {
    setSaving(true);
    setError(null);
    try {
      const validRows = rows.filter((_, i) => rowErrors[i].length === 0);
      return await onImport(validRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setStep("pick");
    setFileName("");
    setHeaders([]);
    setRawRows([]);
    setMapping({});
    setRows([]);
    setError(null);
  }

  return {
    step,
    fileName,
    headers,
    mapping,
    rows,
    rowErrors,
    invalidCount,
    validRowCount,
    error,
    saving,
    handleFile,
    setColumnMapping,
    confirmMapping,
    updateCell,
    removeRow,
    confirmImport,
    reset,
    setStep,
  };
}
