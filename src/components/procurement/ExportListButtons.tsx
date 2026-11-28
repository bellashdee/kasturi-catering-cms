"use client";

import { useEffect, useRef, useState } from "react";
import { exportTableToExcel } from "@/lib/reports/export";
import { groupColumnsForPrint, printTablePdf, type PrintColumnGroup } from "@/lib/export/tableExport";

const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Print by week: the list of one month can be printed for the whole month or for one week of it (days 1-7, 8-14, 15-21, 22-28, 29-end). */
export type WeeklyPrint = {
  /** the header of the column holding the date (YYYY-MM-DD) */
  dateColumn: string;
  /** the month shown (YYYY-MM); "all" (or anything else) prints the whole list only */
  month: string;
  /** the name of the total of a money column in a week's print, e.g. { "Amount (RM)": "Total claimed" } */
  totalLabels?: Record<string, string>;
  /** the column whose amounts are split by company in a week's print (with the "Company" column) */
  companyAmountColumn?: string;
};

type Week = { from: string; to: string; label: string };

/** The weeks of a month: days 1-7, 8-14, 15-21, 22-28 and 29 to the last day (the same split every month, never a one-day week). */
export function weeksOfMonth(month: string): Week[] {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return [];
  const year = Number(m[1]);
  const mon = Number(m[2]);
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const iso = (d: number) => `${m[1]}-${m[2]}-${String(d).padStart(2, "0")}`;
  const weeks: Week[] = [];
  let start = 1;
  while (start <= last) {
    const end = Math.min(last, start + 6);
    const n = weeks.length + 1;
    weeks.push({ from: iso(start), to: iso(end), label: `Week ${n} (${start === end ? start : `${start}–${end}`} ${MONTHS[mon - 1]} ${year})` });
    start = end + 1;
  }
  return weeks;
}

/** Excel download or a printable PDF of a list that is shown on the page in another layout (plain data only crosses from the server). */
export function ExportListButtons({
  filenameBase,
  headers,
  rows,
  moneyColumns = [],
  summary = [],
  title: titleText,
  info = [],
  signatures = [],
  printGroups = [],
  weekly,
}: {
  filenameBase: string;
  headers: string[];
  rows: (string | number)[][];
  /** headers of the RM columns: shown with 2 decimal places (3000.00) in Excel and in the print */
  moneyColumns?: string[];
  /** under the list in the print and in Excel: e.g. the total spent and the spending of each company */
  summary?: { label: string; value: string; bold?: boolean }[];
  /** the heading of the print and of the Excel sheet (otherwise made from the file name) */
  title?: string;
  /** lines above the list in the print and in Excel: e.g. the staff member's name, the company, the period and the totals */
  info?: { label: string; value: string }[];
  /** sign-off boxes at the end of the print and of the Excel sheet (e.g. the staff member, Checked by, Approved by) */
  signatures?: { label: string; name?: string }[];
  /** small related columns shown together in one column of the print only, so that a wide list stays readable (Excel keeps every column) */
  printGroups?: PrintColumnGroup[];
  /** offer printing one week of the month as well as the whole month */
  weekly?: WeeklyPrint;
}) {
  const btn = "rounded-lg border border-border-strong bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-text disabled:opacity-50";
  const title = titleText ?? filenameBase.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase());
  const hasExtra = !!titleText || info.length > 0 || signatures.length > 0;
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const dateAt = weekly ? headers.indexOf(weekly.dateColumn) : -1;
  const weeks = weekly && dateAt >= 0 ? weeksOfMonth(weekly.month) : [];
  const inWeek = (w: Week) => rows.filter((r) => {
    const d = String(r[dateAt] ?? "").slice(0, 10);
    return d >= w.from && d <= w.to;
  });

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  function printRows(list: (string | number)[][], extra: { subtitle?: string; summary: typeof summary; info: typeof info }) {
    // the window is opened by the click itself so that a pop-up blocker lets it through
    const target = window.open("", "_blank");
    const text = list.map((r) => r.map((cell, i) => (typeof cell === "number" && moneyColumns.includes(headers[i]) ? money(cell) : String(cell))));
    const table = groupColumnsForPrint(headers, text, printGroups);
    const count = `${list.length} row${list.length === 1 ? "" : "s"}`;
    printTablePdf({ title, subtitle: extra.subtitle ? `${extra.subtitle} · ${count}` : count, ...table, moneyColumns, landscape: table.columns.length > 6, summary: extra.summary, info: extra.info, signatures }, target);
  }

  function print() {
    setMenu(false);
    printRows(rows, { summary, info });
  }

  /** One week: only its rows, with the totals of that week (the month's totals on the page do not apply). */
  function printWeek(w: Week) {
    setMenu(false);
    const list = inWeek(w);
    const sumOf = (col: number) => Math.round(list.reduce((t, r) => t + (typeof r[col] === "number" ? (r[col] as number) : 0), 0) * 100) / 100;
    const weekSummary: { label: string; value: string; bold?: boolean }[] = [];
    moneyColumns.forEach((name) => {
      const col = headers.indexOf(name);
      if (col < 0) return;
      if (/balance/i.test(name)) {
        // the balance after the last record of the week (rows are in date order, oldest first, in the export)
        const ordered = [...list].sort((a, b) => String(a[dateAt]).localeCompare(String(b[dateAt])));
        const lastValue = ordered.length ? ordered[ordered.length - 1][col] : "";
        if (typeof lastValue === "number") weekSummary.push({ label: "Balance at the end of the week", value: `RM ${money(lastValue)}`, bold: true });
        return;
      }
      const label = weekly?.totalLabels?.[name] ?? `Total ${name.replace(/\s*\(RM\)\s*$/i, "").toLowerCase()}`;
      weekSummary.push({ label, value: `RM ${money(sumOf(col))}` });
    });
    // what each company spent in the week (a record shared by companies is shown under its companies together)
    const companyCol = headers.indexOf("Company");
    const amountCol = weekly?.companyAmountColumn ? headers.indexOf(weekly.companyAmountColumn) : -1;
    if (companyCol >= 0 && amountCol >= 0) {
      const byCompany = new Map<string, number>();
      for (const r of list) {
        if (typeof r[amountCol] !== "number") continue;
        const name = String(r[companyCol] || "-");
        byCompany.set(name, (byCompany.get(name) ?? 0) + (r[amountCol] as number));
      }
      Array.from(byCompany.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([name, total]) => weekSummary.push({ label: `  ${name}`, value: `RM ${money(total)}` }));
    }
    // the lines on top: the period is the week; the month's totals are left out (the week's totals are under the list)
    const weekInfo = info
      .filter((i) => !/^(total|paid|still pending|claims|waiting)/i.test(i.label))
      .map((i) => (i.label === "Period" ? { ...i, value: w.label } : i));
    if (!weekInfo.some((i) => i.label === "Period")) weekInfo.push({ label: "Period", value: w.label });
    printRows(list, { subtitle: w.label, summary: weekSummary, info: weekInfo });
  }
  return (
    <div className="flex gap-2 print:hidden">
      <button
        type="button"
        disabled={rows.length === 0}
        onClick={() => exportTableToExcel(filenameBase, headers, rows, moneyColumns, summary, hasExtra ? { title, info, signatures } : {})}
        className={btn}
      >
        Export Excel
      </button>
      {weeks.length === 0 ? (
        <button type="button" disabled={rows.length === 0} onClick={print} className={btn}>
          Print
        </button>
      ) : (
        <div ref={box} className="relative">
          <button type="button" disabled={rows.length === 0} onClick={() => setMenu((v) => !v)} className={btn} aria-expanded={menu}>
            Print ▾
          </button>
          {menu && (
            <div className="absolute right-0 top-10 z-30 w-64 overflow-hidden rounded-lg border border-border-strong bg-surface text-[13px] shadow-lg">
              <button type="button" onClick={print} className="block w-full px-3.5 py-2.5 text-left font-semibold text-text hover:bg-surface-alt">
                Whole month <span className="font-normal text-text-muted">({rows.length})</span>
              </button>
              <div className="border-t border-border px-3.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-text-muted">By week</div>
              {weeks.map((w) => {
                const n = inWeek(w).length;
                return (
                  <button key={w.from} type="button" disabled={n === 0} onClick={() => printWeek(w)} className="block w-full px-3.5 py-2 text-left text-text hover:bg-surface-alt disabled:text-text-muted disabled:hover:bg-transparent">
                    {w.label} <span className="text-text-muted">({n})</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
