"use client";

import * as XLSX from "xlsx";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportTableToExcel(filenameBase: string, headers: string[], rows: (string | number)[][], moneyColumns: string[] = [], summary: { label: string; value: string }[] = []) {
  // the summary (e.g. total spent and the spending of each company) under the list, after an empty row
  const summaryRows = summary.length > 0 ? [[], ["SUMMARY"], ...summary.map((l) => [l.label.trim(), l.value])] : [];
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows, ...summaryRows]);
  // RM columns keep their numbers but always show 2 decimal places (3000.00)
  headers.forEach((h, c) => {
    if (!moneyColumns.includes(h)) return;
    for (let r = 1; r <= rows.length; r++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === "n") cell.z = "#,##0.00";
    }
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Report");
  XLSX.writeFile(workbook, `${filenameBase}.xlsx`);
}

export function exportTableToCsv(filenameBase: string, headers: string[], rows: (string | number)[][]) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const csv = XLSX.utils.sheet_to_csv(sheet);
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `${filenameBase}.csv`);
}
