"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatPrice, formatMalaysiaDate } from "@/lib/format";
import { paymentMethodFor, type PayrollLine } from "@/lib/hr/payrollCentre";
import { markPayrollEntryPaid, savePayrollEntry, undoPayrollEntryPaid } from "@/lib/hr/payrollCentreActions";
import { AREA, BTN, BTN_GHOST, BTN_SM, BTN_SM_GHOST, Dialog, FIELD, LABEL, Pill } from "@/components/priority/ui";

type Mode = { kind: "salary" | "pay"; line: PayrollLine } | null;

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The salaries still waiting for payment: local staff by bank transfer (bank, account number), foreign staff in cash. */
function downloadBankList(lines: PayrollLine[], month: string) {
  const rows = lines.filter((l) => l.status === "draft" && (l.netPay ?? 0) > 0);
  const header = ["Company", "Name", "Position", "Paid by", "Bank", "Account No.", "Net Salary (RM)"];
  const body = rows.map((l) => [l.companyName, l.fullName, l.position, paymentMethodFor(l.foreign), l.foreign ? null : l.bankName, l.foreign ? null : l.bankAccountNo, (l.netPay ?? 0).toFixed(2)]);
  const csv = [header, ...body].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `salary-payment-list-${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function PayrollCentreTable({ lines, month, today }: { lines: PayrollLine[]; month: string; today: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [gross, setGross] = useState("");
  const [deductions, setDeductions] = useState("0");
  const [remarks, setRemarks] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const [reference, setReference] = useState("");

  const companies = Array.from(new Set(lines.map((l) => l.companyName)));
  const waiting = lines.filter((l) => l.status === "draft" && (l.netPay ?? 0) > 0).length;

  function open(kind: "salary" | "pay", line: PayrollLine) {
    setError(null);
    setGross(line.grossPay !== null ? String(line.grossPay) : "");
    setDeductions(line.deductions !== null ? String(line.deductions) : "0");
    setRemarks(line.remarks ?? "");
    setPaidOn(today);
    setReference("");
    setMode({ kind, line });
  }

  function run(task: () => Promise<void>) {
    setError(null);
    start(async () => {
      try {
        await task();
        setMode(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  function undo(line: PayrollLine) {
    if (!line.recordId) return;
    const id = line.recordId;
    if (!window.confirm(`Undo the payment of ${line.fullName}? The salary goes back to waiting for payment.`)) return;
    run(() => undoPayrollEntryPaid(id));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2.5 print:hidden">
        <button type="button" className={BTN_GHOST} onClick={() => window.print()}>
          🖨 Print
        </button>
        <button type="button" className={BTN_GHOST} disabled={waiting === 0} onClick={() => downloadBankList(lines, month)}>
          ⬇ Download payment list (CSV)
        </button>
        {error && !mode && <span className="self-center text-[13px] font-semibold text-danger">{error}</span>}
      </div>

      {companies.map((company) => {
        const rows = lines.filter((l) => l.companyName === company);
        const total = rows.reduce((sum, l) => sum + (l.netPay ?? 0), 0);
        const paid = rows.filter((l) => l.status === "paid").reduce((sum, l) => sum + (l.netPay ?? 0), 0);
        return (
          <section key={company} className="rounded-2xl border border-border bg-surface shadow-sm print:break-inside-avoid">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
              <h2 className="text-[16px] font-extrabold text-text">{company}</h2>
              <div className="text-[13px] text-text-secondary">
                <span>{`${rows.length} staff`}</span> · <span>Net salary</span> <b className="text-text">{formatPrice(total)}</b> · <span>Paid</span>{" "}
                <b className="text-success">{formatPrice(paid)}</b> · <span>Still to pay</span> <b className="text-text">{formatPrice(total - paid)}</b>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-[13.5px]">
                <thead>
                  <tr className="border-b border-border bg-surface-alt text-[11px] font-bold uppercase tracking-wide text-text-muted">
                    <th className="px-4 py-2.5">Staff</th>
                    <th className="px-3 py-2.5">Bank / Account No. / EPF</th>
                    <th className="px-3 py-2.5 text-right">Gross</th>
                    <th className="px-3 py-2.5 text-right">Deductions</th>
                    <th className="px-3 py-2.5 text-right">Net salary</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5 print:hidden">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.employeeId} className="border-b border-border last:border-b-0 align-top">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-text">{l.fullName}</div>
                        <div className="text-[12px] text-text-muted">{l.position ?? "—"}</div>
                      </td>
                      <td className="px-3 py-3 text-[12.5px]">
                        {l.foreign ? (
                          <Pill tone="neutral">Paid in cash</Pill>
                        ) : l.bankName && l.bankAccountNo ? (
                          <>
                            <div className="font-semibold text-text">{l.bankName}</div>
                            <div className="tabular-nums text-text-secondary">{l.bankAccountNo}</div>
                          </>
                        ) : (
                          <Pill tone="warning">Bank details missing</Pill>
                        )}
                        {l.epfNo && <div className="text-text-muted">{`EPF ${l.epfNo}`}</div>}
                      </td>
                      {l.status === "none" ? (
                        <td colSpan={3} className="px-3 py-3 text-center text-[12.5px] text-text-muted">
                          Salary not entered for this month
                        </td>
                      ) : (
                        <>
                          <td className="px-3 py-3 text-right tabular-nums">{formatPrice(l.grossPay ?? 0)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{formatPrice(l.deductions ?? 0)}</td>
                          <td className="px-3 py-3 text-right font-bold tabular-nums text-text">{formatPrice(l.netPay ?? 0)}</td>
                        </>
                      )}
                      <td className="px-3 py-3">
                        {l.status === "paid" ? (
                          <>
                            <Pill tone="success">Paid</Pill>
                            <div className="mt-1 text-[12px] text-text-secondary">
                              {formatMalaysiaDate(l.paidOn)} · {l.paymentMethod}
                              {l.paymentReference ? ` · ${l.paymentReference}` : ""}
                            </div>
                          </>
                        ) : l.status === "draft" ? (
                          <Pill tone="info">Waiting for payment</Pill>
                        ) : (
                          <Pill tone="neutral">Data required</Pill>
                        )}
                        {l.remarks && <div className="mt-1 text-[12px] text-text-muted">{l.remarks}</div>}
                      </td>
                      <td className="px-3 py-3 print:hidden">
                        <div className="flex flex-wrap gap-1.5">
                          {l.status !== "paid" && (
                            <button type="button" className={BTN_SM_GHOST} onClick={() => open("salary", l)}>
                              {l.status === "none" ? "Enter salary" : "Edit"}
                            </button>
                          )}
                          {l.status === "draft" && (
                            <button type="button" className={BTN_SM} onClick={() => open("pay", l)}>
                              Mark paid
                            </button>
                          )}
                          {l.status === "paid" && (
                            <button type="button" className={BTN_SM_GHOST} disabled={pending} onClick={() => undo(l)}>
                              Undo payment
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {mode?.kind === "salary" && (
        <Dialog title={`Salary — ${mode.line.fullName}`} onClose={() => setMode(null)}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const line = mode.line;
              run(() => savePayrollEntry({ employeeId: line.employeeId, companyId: line.companyId, month, grossPay: Number(gross), deductions: Number(deductions) || 0, remarks }));
            }}
          >
            <p className="text-[13px] text-text-secondary">
              {`${mode.line.companyName} · salary for ${month}. Enter the figures from the offer letter / payslip; nothing is filled in automatically.`}
            </p>
            {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Gross salary (RM) *</label>
                <input type="number" step="0.01" min="0" required className={FIELD} value={gross} onChange={(e) => setGross(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Deductions (RM) (EPF, SOCSO, EIS, advance …)</label>
                <input type="number" step="0.01" min="0" className={FIELD} value={deductions} onChange={(e) => setDeductions(e.target.value)} />
              </div>
            </div>
            <div className="text-[13px] text-text-secondary">
              Net salary: <b className="text-text">{formatPrice(Math.max(0, (Number(gross) || 0) - (Number(deductions) || 0)))}</b>
            </div>
            <div>
              <label className={LABEL}>Remarks</label>
              <textarea className={AREA} rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2.5">
              <button type="button" className={BTN_GHOST} onClick={() => setMode(null)}>
                Cancel
              </button>
              <button type="submit" className={BTN} disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {mode?.kind === "pay" && (
        <Dialog title={`Mark salary as paid — ${mode.line.fullName}`} onClose={() => setMode(null)}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const line = mode.line;
              if (!line.recordId) return;
              const id = line.recordId;
              run(() => markPayrollEntryPaid({ payrollId: id, paidOn, method: paymentMethodFor(line.foreign), reference }));
            }}
          >
            <p className="text-[13px] text-text-secondary">
              {`Net salary ${formatPrice(mode.line.netPay ?? 0)} · ${mode.line.foreign ? "Paid in cash" : `${mode.line.bankName ?? "No bank"} ${mode.line.bankAccountNo ?? ""}`}. Only confirm after the money has really been paid.`}
            </p>
            {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Date paid *</label>
                <input type="date" required max={today} className={FIELD} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>How paid *</label>
                <div className="flex h-10 items-center rounded-lg border border-border-strong bg-bg px-3 text-[14px] font-semibold text-text">{paymentMethodFor(mode.line.foreign)}</div>
              </div>
            </div>
            <div>
              <label className={LABEL}>Bank reference / receipt no.</label>
              <input className={FIELD} value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2.5">
              <button type="button" className={BTN_GHOST} onClick={() => setMode(null)}>
                Cancel
              </button>
              <button type="submit" className={BTN} disabled={pending}>
                {pending ? "Saving…" : "Confirm paid"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
