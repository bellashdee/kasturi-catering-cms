"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { approveRoster, saveRoster } from "@/lib/kitchen/rosterActions";
import { CODE_COLORS, SUMMARY_CODES, daysOfMonth, rosterTitle, shiftHours, shiftMonth, type Roster, type RosterRow, type ShiftCode } from "@/lib/kitchen/roster";
import { downloadTableExcel, printTablePdf, type ExportTable } from "@/lib/export/tableExport";
import { formatMalaysiaDate } from "@/lib/format";

type StaffOption = { id: string; name: string; shortName: string };

const btn = "h-9 rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-text hover:bg-surface-alt disabled:opacity-50";
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthText = (m: string) => `${MONTH_NAMES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

/**
 * The duty roster grid. An editor picks a shift code (the "brush") and taps the days to fill them; taps a date to mark it a public
 * holiday; adds, renames, moves and removes staff rows; then saves. Everyone else sees the roster as it was saved.
 */
export function DutyRosterBoard({
  roster,
  previousRows,
  previousMonth,
  codes,
  kitchens,
  staff,
  canEdit,
  canApprove,
  savedMonths,
}: {
  roster: Roster;
  previousRows: RosterRow[];
  previousMonth: string | null;
  codes: ShiftCode[];
  kitchens: string[];
  staff: StaffOption[];
  canEdit: boolean;
  canApprove: boolean;
  savedMonths: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const days = useMemo(() => daysOfMonth(roster.month), [roster.month]);
  const codeMap = useMemo(() => new Map(codes.map((c) => [c.code, c])), [codes]);

  const [rows, setRows] = useState<RosterRow[]>(roster.rows);
  const [ph, setPh] = useState<number[]>(roster.publicHolidays);
  const [notes, setNotes] = useState(roster.notes ?? "");
  const [brush, setBrush] = useState<string>(codes.find((c) => c.code === "A4")?.code ?? codes[0]?.code ?? "N");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState({ employeeId: "", name: "" });
  const [newKitchen, setNewKitchen] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const go = (params: Record<string, string>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(params)) next.set(k, v);
    if (dirty && !window.confirm("You have changes that are not saved. Leave this roster without saving?")) return;
    router.push(`${pathname}?${next.toString()}`);
  };

  const change = (fn: (rows: RosterRow[]) => RosterRow[]) => {
    setRows(fn);
    setDirty(true);
    setMessage(null);
  };
  const setCell = (rowIndex: number, day: number) =>
    change((rs) =>
      rs.map((r, i) => {
        if (i !== rowIndex) return r;
        const codes = { ...r.codes };
        if (brush === "" || codes[String(day)] === brush) delete codes[String(day)];
        else codes[String(day)] = brush;
        return { ...r, codes };
      }),
    );
  const fillEmpty = (rowIndex: number) =>
    change((rs) => rs.map((r, i) => (i !== rowIndex || !brush ? r : { ...r, codes: Object.fromEntries(days.map((d) => [String(d.day), r.codes[String(d.day)] ?? brush])) })));
  const togglePh = (day: number) => {
    setPh((list) => (list.includes(day) ? list.filter((d) => d !== day) : [...list, day]));
    setDirty(true);
  };
  const move = (i: number, delta: number) =>
    change((rs) => {
      const j = i + delta;
      if (j < 0 || j >= rs.length) return rs;
      const copy = [...rs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const addRow = () => {
    const picked = staff.find((s) => s.id === adding.employeeId);
    const name = (adding.name.trim() || picked?.shortName || picked?.name || "").toUpperCase();
    if (!name) return setError("Choose a staff member or type the name to show on the roster.");
    if (rows.some((r) => r.displayName.toUpperCase() === name || (picked && r.employeeId === picked.id))) return setError(`${name} is already on the roster.`);
    setError(null);
    change((rs) => [...rs, { employeeId: picked?.id ?? null, displayName: name, codes: {} }]);
    setAdding({ employeeId: "", name: "" });
  };

  /** The staff of the last saved month, each with their weekly pattern (the shift they had on the same weekday). */
  const copyPrevious = () => {
    if (!previousMonth) return;
    if (rows.length && !window.confirm(`Replace this roster with the staff and weekly pattern of ${monthText(previousMonth)}?`)) return;
    const prevDays = daysOfMonth(previousMonth);
    const pattern = (r: RosterRow) => {
      const byWeekday = new Map<string, string>();
      for (const d of prevDays) {
        const c = r.codes[String(d.day)];
        if (c && (codeMap.get(c)?.is_work || c === "OD")) byWeekday.set(d.weekday, c);
      }
      return Object.fromEntries(days.filter((d) => byWeekday.has(d.weekday)).map((d) => [String(d.day), byWeekday.get(d.weekday)!]));
    };
    change(() => previousRows.map((r) => ({ employeeId: r.employeeId, displayName: r.displayName, codes: pattern(r) })));
    setMessage(`Copied from ${monthText(previousMonth)}. Check the public holidays and leave, then press Save roster.`);
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await saveRoster({ companyId: roster.companyId, kitchen: roster.kitchen, month: roster.month, publicHolidays: ph, notes, rows });
      if (!res.ok) return setError(res.error);
      setDirty(false);
      setMessage("Roster saved.");
      router.refresh();
    });
  };
  const approve = () => {
    if (!roster.id) return;
    setError(null);
    startTransition(async () => {
      const res = await approveRoster(roster.id!);
      if (!res.ok) return setError(res.error);
      setMessage("Roster approved.");
      router.refresh();
    });
  };

  const count = (r: RosterRow, code: string) => Object.values(r.codes).filter((c) => c === code).length;

  // the export: the grid, then the shift codes under it (like the bottom of the Excel roster)
  const columns = ["No", "Name", ...days.map((d) => `${d.day} ${d.weekday}${ph.includes(d.day) ? " PH" : ""}`), ...SUMMARY_CODES];
  const pad = (cells: string[]) => [...cells, ...Array(Math.max(0, columns.length - cells.length)).fill("")];
  const table: ExportTable = {
    title: `${roster.kitchen} DUTY ROSTER - ${rosterTitle(roster.month)}`,
    subtitle: `Prepared by: ${roster.preparedName ?? "-"}   ·   Approved by: ${roster.approvedName ?? "-"}${ph.length ? `   ·   Public holidays: ${[...ph].sort((a, b) => a - b).join(", ")}` : ""}`,
    columns,
    rows: [
      ...rows.map((r, i) => [String(i + 1), r.displayName, ...days.map((d) => r.codes[String(d.day)] ?? ""), ...SUMMARY_CODES.map((c) => String(count(r, c) || ""))]),
      pad([]),
      pad(["", "SHIFT CODES"]),
      ...codes.map((c) => pad(["", `${c.code}  ${c.is_work ? shiftHours(c) : c.label}`])),
    ],
    landscape: true,
  };

  const chip = (code: string | undefined) => (code ? CODE_COLORS[codeMap.get(code)?.color ?? "neutral"] ?? CODE_COLORS.neutral : "");

  /** One numbered step of the roster work (1 month & kitchen, 2 staff, 3 shifts, 4 save & approve). */
  const step = (n: number, title: string, hint: string | null, content: ReactNode, extra = "") => (
    <section className={`rounded-xl border border-border bg-surface p-4 shadow-sm ${extra}`}>
      <div className="mb-3 flex items-start gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-extrabold text-white">{n}</span>
        <div>
          <div className="text-[15px] font-extrabold text-text">{title}</div>
          {hint && <div className="text-[12.5px] text-text-secondary">{hint}</div>}
        </div>
      </div>
      {content}
    </section>
  );

  return (
    <div className="flex flex-col gap-4">
      {error && <div className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}
      {message && <div className="rounded-lg bg-success-bg px-3 py-2 text-[13px] text-success">{message}</div>}

      {step(
        1,
        "Choose the month and the kitchen",
        canEdit && previousMonth ? `Starting a new month? Copy last month's roster, then change what is different.` : null,
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1.5">
          <button type="button" aria-label="Previous month" className={btn} onClick={() => go({ month: shiftMonth(roster.month, -1) })}>‹</button>
          <input
            type="month"
            value={roster.month}
            onChange={(e) => e.target.value && go({ month: e.target.value })}
            className="h-9 rounded-lg border border-border-strong bg-surface px-3 text-[13px]"
          />
          <button type="button" aria-label="Next month" className={btn} onClick={() => go({ month: shiftMonth(roster.month, 1) })}>›</button>
        </div>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
          Kitchen
          {newKitchen === null ? (
            <select
              value={roster.kitchen}
              onChange={(e) => (e.target.value === "__new" ? setNewKitchen("") : go({ kitchen: e.target.value }))}
              className="h-9 rounded-lg border border-border-strong bg-surface px-3 text-[13px] text-text"
            >
              {kitchens.map((k) => <option key={k} value={k}>{k}</option>)}
              {canEdit && <option value="__new">+ Another kitchen…</option>}
            </select>
          ) : (
            <div className="flex gap-1.5">
              <input autoFocus value={newKitchen} onChange={(e) => setNewKitchen(e.target.value)} placeholder="e.g. KILANG 2" className="h-9 w-36 rounded-lg border border-border-strong px-3 text-[13px] text-text" />
              <button type="button" className={btn} onClick={() => newKitchen.trim() && go({ kitchen: newKitchen.trim().toUpperCase() })}>Open</button>
              <button type="button" className={btn} onClick={() => setNewKitchen(null)}>Cancel</button>
            </div>
          )}
        </label>
            {canEdit && previousMonth && (
              <button type="button" className={btn} onClick={copyPrevious}>Copy from {monthText(previousMonth)}</button>
            )}
          </div>
      {savedMonths.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-text-secondary">
              Saved months:
              {[...savedMonths].sort().map((m) => (
                <button key={m} type="button" onClick={() => go({ month: m })} className={`rounded-full border px-2.5 py-0.5 font-semibold ${m === roster.month ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text hover:bg-surface-alt"}`}>
                  {monthText(m).slice(0, 3)} {m.slice(0, 4)}
                </button>
              ))}
            </div>
          )}

        </div>,
        "print:hidden",
      )}

      {canEdit &&
        step(
          2,
          "Add the kitchen staff",
          "Each staff member added becomes one row of the roster.",
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
              Add kitchen staff
              <select value={adding.employeeId} onChange={(e) => setAdding({ ...adding, employeeId: e.target.value })} className="h-9 w-64 rounded-lg border border-border-strong bg-surface px-2 text-[13px] text-text">
                <option value="">Choose a staff member…</option>
                {staff
                  .filter((s) => !rows.some((r) => r.employeeId === s.id))
                  .map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.shortName})</option>
                  ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
              Name on the roster (optional)
              <input value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} placeholder="Short name is used if empty" className="h-9 w-48 rounded-lg border border-border-strong px-3 text-[13px] text-text" />
            </label>
            <button type="button" onClick={addRow} className={btn}>+ Add to roster</button>
          </div>,
          "print:hidden",
        )}

      {canEdit &&
        step(
          3,
          "Choose a shift, then tap the days",
          "Tap a shift below, then tap the boxes in the roster to fill them. Tap a date at the top of the roster to mark a public holiday.",
          <div className="flex flex-wrap gap-1.5">
            {codes.map((c) => (
              <button
                key={c.code}
                type="button"
                title={c.is_work ? shiftHours(c) : c.label}
                onClick={() => setBrush(c.code)}
                className={`rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold ${chip(c.code)} ${brush === c.code ? "ring-2 ring-primary ring-offset-1" : ""}`}
              >
                {c.code}
                <span className="ml-1 font-normal opacity-75">{c.is_work ? shiftHours(c) : c.label}</span>
              </button>
            ))}
            <button type="button" onClick={() => setBrush("")} className={`rounded-lg border border-border-strong px-2.5 py-1.5 text-[12.5px] font-bold text-text ${brush === "" ? "ring-2 ring-primary ring-offset-1" : ""}`}>
              Clear
            </button>
          </div>
,
          "print:hidden",
        )}

      {/* the roster */}
      <div className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-4 py-3 text-center text-[15px] font-extrabold tracking-wide text-text">
          {roster.kitchen} · {rosterTitle(roster.month)}
          {!roster.id && <span className="ml-2 text-[12px] font-semibold text-warning">(not saved yet)</span>}
        </div>
        {rows.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13px] text-text-muted">
            No roster for {monthText(roster.month)} yet.
            {canEdit ? (previousMonth ? ` Press "Copy from ${monthText(previousMonth)}" or add the staff below.` : " Add the staff below.") : ""}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="border-collapse text-[12px]">
              <thead>
                <tr className="bg-surface-alt text-[10.5px] font-bold uppercase text-text-muted">
                  <th className="sticky left-0 z-10 bg-surface-alt px-2 py-1.5 text-left" rowSpan={2}>No</th>
                  <th className="sticky left-8 z-10 min-w-[150px] bg-surface-alt px-2 py-1.5 text-left" rowSpan={2}>Name</th>
                  {days.map((d) => (
                    <th key={d.day} className={`min-w-[34px] border-l border-border px-0.5 pt-1.5 text-center ${d.weekend ? "text-danger" : ""}`}>{d.weekday}</th>
                  ))}
                  {SUMMARY_CODES.map((c) => (
                    <th key={c} rowSpan={2} className="min-w-[34px] border-l-2 border-border-strong px-1 text-center">{c}</th>
                  ))}
                  {canEdit && <th rowSpan={2} className="border-l border-border px-2 text-left">Row</th>}
                </tr>
                <tr className="bg-surface-alt text-[11.5px] font-bold text-text">
                  {days.map((d) => {
                    const isPh = ph.includes(d.day);
                    return (
                      <th key={d.day} className={`border-l border-border px-0.5 pb-1.5 text-center ${isPh ? "bg-red-100 text-red-800" : ""}`}>
                        {canEdit ? (
                          <button type="button" onClick={() => togglePh(d.day)} title={isPh ? "Public holiday (tap to remove)" : "Tap to mark a public holiday"} className="w-full">
                            {d.day}
                            {isPh && <div className="text-[9px] leading-none">PH</div>}
                          </button>
                        ) : (
                          <>
                            {d.day}
                            {isPh && <div className="text-[9px] leading-none">PH</div>}
                          </>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.displayName}-${i}`} className="border-t border-border">
                    <td className="sticky left-0 z-10 bg-surface px-2 py-1 text-text-muted">{i + 1}</td>
                    <td className="sticky left-8 z-10 bg-surface px-2 py-1 font-semibold text-text">
                      {canEdit ? (
                        <input
                          value={r.displayName}
                          onChange={(e) => change((rs) => rs.map((x, j) => (j === i ? { ...x, displayName: e.target.value.toUpperCase() } : x)))}
                          className="w-[140px] rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-border focus:border-primary"
                        />
                      ) : (
                        r.displayName
                      )}
                    </td>
                    {days.map((d) => {
                      const code = r.codes[String(d.day)];
                      const cls = `h-8 w-full text-center text-[11.5px] font-bold ${chip(code)} ${ph.includes(d.day) && !code ? "bg-red-50" : ""}`;
                      return (
                        <td key={d.day} className="border-l border-border p-0">
                          {canEdit ? (
                            <button type="button" onClick={() => setCell(i, d.day)} className={`${cls} hover:outline hover:outline-2 hover:outline-primary`}>{code ?? ""}</button>
                          ) : (
                            <div className={`${cls} flex items-center justify-center`}>{code ?? ""}</div>
                          )}
                        </td>
                      );
                    })}
                    {SUMMARY_CODES.map((c) => (
                      <td key={c} className="border-l-2 border-border-strong text-center font-semibold text-text">{count(r, c) || ""}</td>
                    ))}
                    {canEdit && (
                      <td className="border-l border-border px-2">
                        <div className="flex gap-1.5 whitespace-nowrap text-[11.5px] font-semibold">
                          <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-text-secondary disabled:opacity-30" aria-label="Move up">↑</button>
                          <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} className="text-text-secondary disabled:opacity-30" aria-label="Move down">↓</button>
                          <button type="button" onClick={() => fillEmpty(i)} disabled={!brush} className="text-primary disabled:opacity-30">Fill empty with {brush || "…"}</button>
                          <button type="button" onClick={() => window.confirm(`Remove ${r.displayName} from this roster?`) && change((rs) => rs.filter((_, j) => j !== i))} className="text-danger">Remove</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {step(
        canEdit ? 4 : 2,
        canEdit ? "Save, then get it approved" : "Approval & notes",
        canEdit ? "Press Save roster after every change. The roster is then approved, and can be printed or exported." : null,
        <div className="flex flex-col gap-3">
          {dirty && <div className="rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-[13px] font-semibold text-warning">You have changes that are not saved yet. Press Save roster.</div>}
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <button type="button" disabled={pending || !dirty} onClick={save} className="h-10 rounded-lg bg-primary px-5 text-[14px] font-bold text-white disabled:opacity-50">
                {pending ? "Saving…" : "Save roster"}
              </button>
            )}
            <button type="button" className={btn} disabled={rows.length === 0} onClick={() => printTablePdf(table, window.open("", "_blank"))}>Print</button>
            <button type="button" className={btn} disabled={rows.length === 0} onClick={() => downloadTableExcel(table)}>Export Excel</button>
          </div>
          <div className="grid grid-cols-2 gap-4 text-[12.5px]">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Prepared by</div>
              <div className="mt-1 font-semibold text-text">{roster.preparedName ?? "—"}</div>
              <div className="text-text-secondary">{roster.preparedAt ? formatMalaysiaDate(roster.preparedAt) : ""}</div>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Approved by</div>
              <div className="mt-1 font-semibold text-text">{roster.approvedName ?? "—"}</div>
              <div className="text-text-secondary">{roster.approvedAt ? formatMalaysiaDate(roster.approvedAt) : roster.id ? "Waiting for approval" : ""}</div>
              {canApprove && roster.id && !roster.approvedAt && !dirty && (
                <button type="button" disabled={pending} onClick={approve} className="mt-1.5 h-8 rounded-lg bg-success px-3 text-[12.5px] font-bold text-white disabled:opacity-50">Approve roster</button>
              )}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
            Notes
            {canEdit ? (
              <textarea rows={2} value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); }} className="rounded-lg border border-border-strong px-3 py-2 text-[13px] font-normal text-text" />
            ) : (
              <div className="text-[13px] font-normal text-text">{notes || "—"}</div>
            )}
          </label>
          {!canEdit && <div className="text-[12px] text-text-muted">Only Chef Atiq (or a Super Admin) can change this roster.</div>}
        </div>,
      )}

      {/* the shift times, like the bottom of the Excel roster */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="mb-2 text-[13px] font-extrabold uppercase tracking-wide text-text">Shift codes</div>
          <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {codes.map((c) => (
              <div key={c.code} className="flex items-center gap-2 text-[12.5px]">
                <span className={`inline-block min-w-[38px] rounded px-1.5 py-0.5 text-center font-bold ${chip(c.code)}`}>{c.code}</span>
                <span className="text-text">{c.is_work ? shiftHours(c) : c.label}</span>
              </div>
            ))}
          </div>
        </div>
    </div>
  );
}
