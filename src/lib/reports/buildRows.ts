import type { ReportRow } from "@/components/reports/ReportTable";

export type ReportColumnDef<T> = {
  key: string;
  label: string;
  exportValue: (row: T) => string | number;
  display?: (row: T) => React.ReactNode;
};

/**
 * Runs entirely on the server: turns real rows + column definitions (which
 * may hold functions/closures) into the plain headers + cell data
 * `ReportTable` can safely receive as a Client Component. This is the one
 * place a report page's column functions get *called*, not passed across.
 */
export function buildReportRows<T>(
  rows: T[],
  columns: ReportColumnDef<T>[],
  rowKey: (row: T, index: number) => string,
): { headers: string[]; tableRows: ReportRow[] } {
  const headers = columns.map((c) => c.label);
  const tableRows = rows.map((row, i) => ({
    rowKey: rowKey(row, i),
    cells: columns.map((c) => ({ key: c.key, exportValue: c.exportValue(row), display: c.display?.(row) })),
  }));
  return { headers, tableRows };
}
