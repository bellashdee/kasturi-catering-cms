"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { matchStaff, readPayslipPdf, readPayslipSpreadsheet, type PayslipRow, type StaffOption } from "@/lib/hr/payslipImport";
import { importPayrollEntries } from "@/lib/hr/payrollImportActions";

type Line = PayslipRow & { key: string; employeeId: string | null; include: boolean };

const money = (n: number | null) => (n === null ? "" : n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const toNum = (s: string): number | null => (s.trim() === "" ? null : Number.isFinite(Number(s.replace(/,/g, ""))) ? Number(s.replace(/,/g, "")) : null);
const box = "h-8 w-24 rounded-md border border-border-strong bg-white px-2 text-right text-[13px] tabular-nums outline-none focus:border-primary";

/**
 * Import payslips into the Payroll Centre: choose the month, drop the payslip PDF(s) or the payroll Excel / CSV, check what was read
 * and which staff each payslip belongs to, then Save. The files are read in this browser only.
 */
export function PayslipImportFlow({ staff, month: initialMonth }: { staff: StaffOption[]; month: string }) {
  const router = useRouter();
  const [month, setMonth] = useState(initialMonth);
  const [lines, setLines] = useState<Line[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<{ saved: number; failed: { employeeId: string; error: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  async function readFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setReading(true);
    setResult(null);
    setError(null);
    const found: Line[] = [];
    const notes: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
        const { rows, problems: p } = isPdf ? await readPayslipPdf(file) : await readPayslipSpreadsheet(file);
        notes.push(...p);
        rows.forEach((r, i) => {
          const employeeId = matchStaff(r, staff);
          found.push({ ...r, key: `${file.name}-${i}-${Date.now()}`, employeeId, include: !!employeeId && r.gross !== null });
        });
      } catch (e) {
        notes.push(`${file.name}: could not be read (${e instanceof Error ? e.message : "unknown error"}).`);
      }
    }
    setLines((prev) => [...prev, ...found]);
    setProblems((prev) => [...prev, ...notes]);
    setReading(false);
  }

  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const duplicateIds = useMemo(() => {
    const seen = new Map<string, number>();
    for (const l of lines) if (l.include && l.employeeId) seen.set(l.employeeId, (seen.get(l.employeeId) ?? 0) + 1);
    return new Set(Array.from(seen.entries()).filter(([, n]) => n > 1).map(([id]) => id));
  }, [lines]);

  const ready = lines.filter((l) => l.include && l.employeeId && l.gross !== null && l.gross > 0);
  const blocked = ready.some((l) => duplicateIds.has(l.employeeId!)) || ready.some((l) => (l.deductions ?? 0) > (l.gross ?? 0));
  const totalNet = ready.reduce((t, l) => t + (l.gross ?? 0) - (l.deductions ?? 0), 0);

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await importPayrollEntries(
        month,
        ready.map((l) => ({ employeeId: l.employeeId!, companyId: staffById.get(l.employeeId!)!.companyId, grossPay: l.gross ?? 0, deductions: l.deductions ?? 0, basic: l.basic, remarks: `Imported from ${l.source}` })),
      );
      if (res.ok) {
        setResult({ saved: res.saved, failed: res.failed });
        const failedIds = new Set(res.failed.map((f) => f.employeeId));
        setLines((ls) => ls.filter((l) => !(l.include && l.employeeId && !failedIds.has(l.employeeId))));
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
          Salary month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-10 rounded-lg border border-border-strong bg-white px-3 text-[13.5px]" />
        </label>
        <label className="flex cursor-pointer flex-col gap-1 text-[12px] font-semibold text-text-secondary">
          Payslip files (PDF, Excel or CSV — you can choose several)
          <input type="file" multiple accept=".pdf,.xlsx,.xls,.csv" disabled={reading} onChange={(e) => { void readFiles(e.target.files); e.target.value = ""; }} className="text-[13px]" />
        </label>
        {reading && <span className="text-[13px] text-text-secondary">Reading the files…</span>}
        {lines.length > 0 && (
          <button type="button" onClick={() => { setLines([]); setProblems([]); setResult(null); }} className="ml-auto h-9 rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-text">
            Clear all
          </button>
        )}
      </div>

      <div className="rounded-xl bg-surface-alt px-4 py-3 text-[12.5px] leading-relaxed text-text-secondary">
        <b className="text-text">How it works:</b> a PDF is read page by page (one payslip per page): the staff name / IC / staff no., Basic, Gross (Total Earnings), Total Deductions and Net Pay.
        An Excel or CSV needs one row per staff with a header row (Name or Staff No. or IC, and Gross / Deductions / Net). Check the figures and the staff on each line before saving —
        a salary already marked paid is not changed. The files stay on this computer; only the figures you save are sent.
      </div>

      {problems.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning-bg px-4 py-3 text-[12.5px] text-warning">
          {problems.map((p, i) => (
            <div key={i}>• {p}</div>
          ))}
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-success/40 bg-success-bg px-4 py-3 text-[13px] text-success">
          {result.saved} payslip{result.saved === 1 ? "" : "s"} saved to {month}.{" "}
          <Link href={`/payroll-centre?month=${month}`} className="font-semibold underline">Open the Payroll Centre</Link>
          {result.failed.map((f) => (
            <div key={f.employeeId} className="text-danger">✕ {staffById.get(f.employeeId)?.name ?? f.employeeId}: {f.error}</div>
          ))}
        </div>
      )}

      {lines.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[1050px] text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-alt text-left text-[11.5px] font-bold uppercase tracking-wide text-text-secondary">
                <th className="px-3 py-2.5">Save</th>
                <th className="px-3 py-2.5">On the payslip</th>
                <th className="px-3 py-2.5">Staff in the system</th>
                <th className="px-3 py-2.5 text-right">Basic</th>
                <th className="px-3 py-2.5 text-right">Gross</th>
                <th className="px-3 py-2.5 text-right">Deductions</th>
                <th className="px-3 py-2.5 text-right">Net (saved)</th>
                <th className="px-3 py-2.5">Check</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((l) => {
                const net = l.gross !== null ? Math.round(((l.gross ?? 0) - (l.deductions ?? 0)) * 100) / 100 : null;
                const issues: string[] = [];
                if (!l.employeeId) issues.push("Choose the staff");
                if (l.gross === null || l.gross <= 0) issues.push("Gross missing");
                if ((l.deductions ?? 0) > (l.gross ?? 0)) issues.push("Deductions more than gross");
                if (l.net !== null && net !== null && Math.abs(l.net - net) > 0.01) issues.push(`Payslip net is ${money(l.net)}`);
                if (l.employeeId && duplicateIds.has(l.employeeId) && l.include) issues.push("Same staff twice");
                return (
                  <tr key={l.key} className={l.include ? "" : "opacity-60"}>
                    <td className="px-3 py-2"><input type="checkbox" checked={l.include} onChange={(e) => update(l.key, { include: e.target.checked })} /></td>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-text">{l.name || "—"}</div>
                      <div className="text-[11.5px] text-text-muted">{[l.employeeNo, l.ic].filter(Boolean).join(" · ") || "no staff no. / IC"} · {l.source}</div>
                    </td>
                    <td className="px-3 py-2">
                      <select value={l.employeeId ?? ""} onChange={(e) => update(l.key, { employeeId: e.target.value || null, include: !!e.target.value })} className={`h-8 max-w-64 rounded-md border px-2 text-[13px] ${l.employeeId ? "border-border-strong" : "border-danger"}`}>
                        <option value="">— choose staff —</option>
                        {staff.map((s) => (
                          <option key={s.id} value={s.id}>{s.name} · {s.companyName}{s.employeeNo ? ` · ${s.employeeNo}` : ""}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right"><input className={box} defaultValue={money(l.basic)} onBlur={(e) => update(l.key, { basic: toNum(e.target.value) })} /></td>
                    <td className="px-3 py-2 text-right"><input className={box} defaultValue={money(l.gross)} onBlur={(e) => update(l.key, { gross: toNum(e.target.value) })} /></td>
                    <td className="px-3 py-2 text-right"><input className={box} defaultValue={money(l.deductions)} onBlur={(e) => update(l.key, { deductions: toNum(e.target.value) })} /></td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums text-text">{money(net)}</td>
                    <td className="px-3 py-2 text-[12px]">{issues.length === 0 ? <span className="font-semibold text-success">OK</span> : <span className="text-danger">{issues.join(" · ")}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {error && <div className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}

      {lines.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={pending || ready.length === 0 || blocked} onClick={save} className="h-10 rounded-lg bg-primary px-5 text-[13.5px] font-semibold text-white disabled:opacity-50">
            {pending ? "Saving…" : `Save ${ready.length} payslip${ready.length === 1 ? "" : "s"} to ${month}`}
          </button>
          <span className="text-[13px] text-text-secondary">Net total RM {money(totalNet)}{blocked ? " · fix the lines marked in red first" : ""}</span>
        </div>
      )}
    </div>
  );
}
