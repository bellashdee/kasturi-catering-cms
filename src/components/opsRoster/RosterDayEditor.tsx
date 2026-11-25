"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteDayRoster, saveDayRoster } from "@/lib/opsRoster/actions";
import {
  blankEntry,
  dayTitle,
  entryHours,
  hoursText,
  OT_CHIP,
  STATUS,
  TASK_TYPES,
  whatsappText,
  type DayRoster,
  type RosterEntry,
  type RosterStaff,
  type RosterStatus,
  type RosterTask,
  type TaskType,
  type TimeSlot,
} from "@/lib/opsRoster/shared";
import { RosterDayView } from "@/components/opsRoster/RosterDayView";
import { dayRosterPdf } from "@/components/opsRoster/rosterExport";

const btn = "h-9 rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-text hover:bg-surface-alt disabled:opacity-50";
const input = "h-9 rounded-lg border border-border-strong bg-white px-2.5 text-[13.5px] text-text outline-none focus:border-primary";
const DEFAULT_REMARKS = "Schedule might change depending on tomorrow's operational situation.";

/**
 * The admin's editor of one day. A day without a roster starts from the latest saved day ("copy") or blank; every staff member
 * gets a card with the status, any number of working-time slots (with break and OT), any number of tasks (type, details, location,
 * time) and a note. Save keeps every other day as it is.
 */
export function RosterDayEditor({ date, day, staff, previous }: { date: string; day: DayRoster | null; staff: RosterStaff[]; previous: DayRoster | null }) {
  const router = useRouter();
  const active = staff.filter((s) => s.active);
  const byId = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const [entries, setEntries] = useState<RosterEntry[] | null>(day ? day.entries : null);
  const [remarks, setRemarks] = useState(day?.remarks ?? DEFAULT_REMARKS);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const edit = (fn: (list: RosterEntry[]) => RosterEntry[]) => {
    setEntries((list) => fn(list ?? []));
    setDirty(true);
    setMessage(null);
  };
  const editEntry = (staffId: string, fn: (e: RosterEntry) => RosterEntry) => edit((list) => list.map((e) => (e.staffId === staffId ? fn(e) : e)));

  const startFrom = (source: "previous" | "blank") => {
    if (source === "previous" && previous) {
      const kept = previous.entries.filter((e) => byId.get(e.staffId)?.active).map((e) => ({ ...e, changedAt: null }));
      const missing = active.filter((s) => !kept.some((e) => e.staffId === s.id)).map((s) => blankEntry(s.id));
      setEntries([...kept, ...missing]);
      setRemarks(previous.remarks || DEFAULT_REMARKS);
      setMessage(`Copied from ${dayTitle(previous.date)}. Change what is different today, then press Save roster.`);
    } else {
      setEntries(active.map((s) => blankEntry(s.id)));
      setMessage(null);
    }
    setDirty(true);
  };

  const current: DayRoster = { id: day?.id ?? null, date, remarks, version: day?.version ?? 0, updatedAt: day?.updatedAt ?? null, updatedByName: day?.updatedByName ?? null, entries: entries ?? [] };
  const notOnDay = active.filter((s) => !(entries ?? []).some((e) => e.staffId === s.id));

  const save = () =>
    startTransition(async () => {
      setError(null);
      const res = await saveDayRoster({ date, remarks, entries: entries ?? [], baseVersion: day ? day.version : null });
      if (!res.ok) return setError(res.error);
      setDirty(false);
      setMessage(res.changed ? `Roster saved. ${res.changed} staff ${res.changed === 1 ? "has" : "have"} been told about the change.` : "Roster saved.");
      router.refresh();
    });
  const remove = () => {
    if (!window.confirm(`Delete the roster of ${dayTitle(date)}? The change history keeps a record of it.`)) return;
    startTransition(async () => {
      const res = await deleteDayRoster(date);
      if (!res.ok) return setError(res.error);
      setEntries(null);
      setDirty(false);
      router.refresh();
    });
  };
  const copyWhatsapp = async () => {
    try {
      await navigator.clipboard.writeText(whatsappText(current, staff));
      setMessage(dirty ? "Copied to WhatsApp format. Note: your latest changes are not saved yet." : "Copied. Open WhatsApp and paste it in the group.");
    } catch {
      setError("Could not copy. Please allow copying in your browser and try again.");
    }
  };

  if (entries === null) {
    return (
      <div className="rounded-xl border border-dashed border-border-strong bg-surface p-6 text-center shadow-sm">
        <div className="text-[15px] font-bold text-text">No roster for {dayTitle(date)} yet</div>
        <p className="mt-1 text-[13px] text-text-secondary">Start from the latest roster and change what is different, or start with an empty roster.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {previous && (
            <button type="button" onClick={() => startFrom("previous")} className="h-10 rounded-lg bg-primary px-4 text-[13.5px] font-semibold text-white">
              Copy from {dayTitle(previous.date)}
            </button>
          )}
          <button type="button" onClick={() => startFrom("blank")} className={`${btn} h-10`}>Start an empty roster</button>
        </div>
        {active.length === 0 && <p className="mt-3 text-[12.5px] text-danger">Add staff in the Staff tab first.</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface/95 px-3 py-2.5 shadow-sm backdrop-blur">
        <button type="button" disabled={pending || !dirty} onClick={save} className="h-9 rounded-lg bg-primary px-4 text-[13px] font-bold text-white disabled:opacity-50">
          {pending ? "Saving…" : day ? "Save changes" : "Save roster"}
        </button>
        <button type="button" onClick={() => setPreview((p) => !p)} className={btn}>{preview ? "Back to editing" : "Preview"}</button>
        <button type="button" onClick={copyWhatsapp} className="h-9 rounded-lg bg-[#25D366] px-3.5 text-[13px] font-bold text-white">Copy to WhatsApp</button>
        <button type="button" onClick={() => dayRosterPdf(current, staff, "download")} className={btn}>Download PDF</button>
        <button type="button" onClick={() => dayRosterPdf(current, staff, "print")} className={btn}>Print A4</button>
        {day && <button type="button" disabled={pending} onClick={remove} className="ml-auto h-9 rounded-lg px-3 text-[13px] font-semibold text-danger hover:bg-danger-bg">Delete this day</button>}
      </div>
      {error && <div className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}
      {message && <div className="rounded-lg bg-success-bg px-3 py-2 text-[13px] text-success">{message}</div>}
      {dirty && <div className="rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-[13px] font-semibold text-warning">Not saved yet. Press {day ? "Save changes" : "Save roster"} when you are done.</div>}

      {preview ? (
        <RosterDayView day={current} staff={staff} />
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            {entries.map((e, index) => (
              <EntryEditor
                key={e.staffId}
                entry={e}
                name={byId.get(e.staffId)?.shortName ?? "—"}
                fullName={byId.get(e.staffId)?.fullName ?? ""}
                first={index === 0}
                last={index === entries.length - 1}
                onChange={(fn) => editEntry(e.staffId, fn)}
                onMove={(d) =>
                  edit((list) => {
                    const j = index + d;
                    if (j < 0 || j >= list.length) return list;
                    const copy = [...list];
                    [copy[index], copy[j]] = [copy[j], copy[index]];
                    return copy;
                  })
                }
                onRemove={() => window.confirm(`Take ${byId.get(e.staffId)?.shortName} off this day's roster?`) && edit((list) => list.filter((x) => x.staffId !== e.staffId))}
              />
            ))}
          </div>
          {notOnDay.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-text-secondary">
              Not on this day:
              {notOnDay.map((s) => (
                <button key={s.id} type="button" onClick={() => edit((list) => [...list, blankEntry(s.id)])} className="rounded-full border border-border-strong bg-surface px-3 py-1 font-semibold text-text hover:bg-surface-alt">
                  + {s.shortName}
                </button>
              ))}
            </div>
          )}
          <label className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4 text-[12px] font-bold uppercase tracking-wide text-text-secondary shadow-sm">
            Remarks
            <textarea rows={2} value={remarks} onChange={(ev) => { setRemarks(ev.target.value); setDirty(true); }} className="rounded-lg border border-border-strong px-3 py-2 text-[14px] font-normal normal-case tracking-normal text-text" />
          </label>
        </>
      )}
    </div>
  );
}

function EntryEditor({
  entry: e,
  name,
  fullName,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  entry: RosterEntry;
  name: string;
  fullName: string;
  first: boolean;
  last: boolean;
  onChange: (fn: (e: RosterEntry) => RosterEntry) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { worked, ot } = entryHours(e);
  const setSlot = (i: number, patch: Partial<TimeSlot>) => onChange((x) => ({ ...x, slots: x.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const setTask = (i: number, patch: Partial<RosterTask>) => onChange((x) => ({ ...x, tasks: x.tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));
  const moveTask = (i: number, d: -1 | 1) =>
    onChange((x) => {
      const j = i + d;
      if (j < 0 || j >= x.tasks.length) return x;
      const tasks = [...x.tasks];
      [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
      return { ...x, tasks };
    });
  const onDuty = e.status === "on_duty";

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <div className="text-[17px] font-extrabold tracking-wide text-text">{name}</div>
          <div className="truncate text-[11.5px] text-text-muted">{fullName}</div>
        </div>
        <div className="ml-auto flex gap-1 text-[12px] font-semibold">
          <button type="button" disabled={first} onClick={() => onMove(-1)} className="rounded px-1.5 text-text-secondary disabled:opacity-30" aria-label="Move up">↑</button>
          <button type="button" disabled={last} onClick={() => onMove(1)} className="rounded px-1.5 text-text-secondary disabled:opacity-30" aria-label="Move down">↓</button>
          <button type="button" onClick={onRemove} className="rounded px-1.5 text-text-secondary hover:text-danger">Remove</button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(Object.keys(STATUS) as RosterStatus[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onChange((x) => ({ ...x, status: k }))}
            className={`rounded-full border px-3 py-1 text-[12px] font-bold ${e.status === k ? `${STATUS[k].chip} ring-2 ring-offset-1 ring-current` : "border-border-strong bg-surface text-text-secondary"}`}
          >
            {STATUS[k].label}
          </button>
        ))}
        {onDuty && (
          <label className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-bold ${e.ot ? `${OT_CHIP} ring-2 ring-offset-1 ring-current` : "border-border-strong text-text-secondary"}`}>
            <input type="checkbox" checked={e.ot} onChange={(ev) => onChange((x) => ({ ...x, ot: ev.target.checked }))} className="h-3.5 w-3.5" />
            + OT
          </label>
        )}
      </div>

      {onDuty && (
        <>
          <div className="mt-3 text-[11.5px] font-bold uppercase tracking-wide text-text-muted">Working hours</div>
          <div className="mt-1.5 flex flex-col gap-2">
            {e.slots.map((s, i) => (
              <div key={i} className="flex flex-wrap items-center gap-1.5 rounded-lg bg-surface-alt p-2">
                <input type="time" value={s.start} onChange={(ev) => setSlot(i, { start: ev.target.value })} className={`${input} w-[7.5rem]`} aria-label="Start" />
                <span className="text-text-muted">–</span>
                <input type="time" value={s.end} onChange={(ev) => setSlot(i, { end: ev.target.value })} className={`${input} w-[7.5rem]`} aria-label="End" />
                <label className="flex items-center gap-1 text-[12px] text-text-secondary">
                  Break
                  <input type="number" min={0} step={15} value={s.break_minutes || ""} placeholder="0" onChange={(ev) => setSlot(i, { break_minutes: Number(ev.target.value) || 0 })} className={`${input} w-16`} />
                  min
                </label>
                <label className="flex items-center gap-1 text-[12px] font-semibold text-sky-800">
                  <input type="checkbox" checked={s.ot} onChange={(ev) => setSlot(i, { ot: ev.target.checked })} />
                  OT hours
                </label>
                <button type="button" onClick={() => onChange((x) => ({ ...x, slots: x.slots.filter((_, j) => j !== i) }))} className="ml-auto text-[12px] font-semibold text-text-secondary hover:text-danger">Remove</button>
              </div>
            ))}
            <button type="button" onClick={() => onChange((x) => ({ ...x, slots: [...x.slots, { start: "", end: "", break_minutes: 0, ot: false }] }))} className="self-start text-[12.5px] font-bold text-primary">
              + Add working time
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-text-secondary">
            <span>
              {hoursText(worked)} working · OT <b className="text-sky-800">{hoursText(ot)}</b>
            </span>
            <label className="flex items-center gap-1">
              Set OT hours yourself
              <input
                type="number"
                min={0}
                max={24}
                step={0.5}
                value={e.otHoursOverride ?? ""}
                placeholder="auto"
                onChange={(ev) => onChange((x) => ({ ...x, otHoursOverride: ev.target.value === "" ? null : Number(ev.target.value) }))}
                className={`${input} h-8 w-20`}
              />
            </label>
          </div>

          <div className="mt-3 text-[11.5px] font-bold uppercase tracking-wide text-text-muted">Tasks</div>
          <div className="mt-1.5 flex flex-col gap-2">
            {e.tasks.map((t, i) => (
              <div key={i} className="grid grid-cols-2 gap-1.5 rounded-lg bg-surface-alt p-2 sm:grid-cols-[8.5rem_1fr_1fr_6.5rem_auto]">
                <select value={t.type} onChange={(ev) => setTask(i, { type: ev.target.value as TaskType })} className={input}>
                  {TASK_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input value={t.text} onChange={(ev) => setTask(i, { text: ev.target.value })} placeholder={t.type === "other" ? "What to do" : "Details (e.g. 3 & 4, JDT 2)"} className={input} />
                <input value={t.location} onChange={(ev) => setTask(i, { location: ev.target.value })} placeholder="Location (e.g. Rumah, UTM)" className={input} />
                <input type="time" value={t.time} onChange={(ev) => setTask(i, { time: ev.target.value })} className={input} aria-label="Time (optional)" />
                <div className="flex items-center gap-1 text-[12px] font-semibold">
                  <button type="button" onClick={() => moveTask(i, -1)} className="px-1 text-text-secondary" aria-label="Move up">↑</button>
                  <button type="button" onClick={() => moveTask(i, 1)} className="px-1 text-text-secondary" aria-label="Move down">↓</button>
                  <button type="button" onClick={() => onChange((x) => ({ ...x, tasks: x.tasks.filter((_, j) => j !== i) }))} className="px-1 text-text-secondary hover:text-danger">✕</button>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => onChange((x) => ({ ...x, tasks: [...x.tasks, { type: "other", text: "", location: "", time: "" }] }))} className="self-start text-[12.5px] font-bold text-primary">
              + Add task
            </button>
          </div>
        </>
      )}

      <input value={e.note} onChange={(ev) => onChange((x) => ({ ...x, note: ev.target.value }))} placeholder="Special instruction for this staff (optional)" className={`${input} mt-3 w-full`} />
    </div>
  );
}
