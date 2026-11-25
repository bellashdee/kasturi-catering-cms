"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveEquipmentChecklist, signEquipmentChecklist } from "@/lib/driver/equipmentChecklistActions";
import { SIGNATURES, type ChecklistItem, type SignatureKey } from "@/lib/driver/equipmentChecklist";
import { downloadTableExcel, printTablePdf, type ExportTable } from "@/lib/export/tableExport";
import { formatMalaysiaDate, formatMalaysiaDateTime, formatTime12 } from "@/lib/format";

type EventInfo = { id: string; client: string; venue: string | null; pax: number | null; date: string | null; eventTime: string | null; setupTime: string | null; company: string };
type Signature = { name: string; at: string | null; mine: boolean } | null;

const btn = "h-9 rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-text hover:bg-surface-alt disabled:opacity-50";
const num = "h-8 w-16 rounded-md border border-border-strong bg-white px-1.5 text-center text-[13px] outline-none focus:border-primary";

/** The equipment checklist of one event: pieces out to the event and back in, the missing pieces, and the four signatures. */
export function EquipmentChecklistForm({ event, items: initial, notes: initialNotes, saved, signatures }: { event: EventInfo; items: ChecklistItem[]; notes: string; saved: boolean; signatures: Record<string, Signature> }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [notes, setNotes] = useState(initialNotes);
  const [dirty, setDirty] = useState(false);
  const [onlyUsed, setOnlyUsed] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", side: "left" as "left" | "right" });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const setCount = (name: string, field: "out" | "in", value: string) => {
    const n = value === "" ? null : Math.max(0, Math.round(Number(value)));
    setItems((list) => list.map((i) => (i.name === name ? { ...i, [field]: Number.isFinite(n as number) || n === null ? n : i[field] } : i)));
    setDirty(true);
    setMessage(null);
  };
  const short = (i: ChecklistItem) => ((i.out ?? 0) > 0 && i.in !== null ? Math.max(0, (i.out ?? 0) - (i.in ?? 0)) : 0);
  const totalOut = items.reduce((s, i) => s + (i.out ?? 0), 0);
  const totalIn = items.reduce((s, i) => s + (i.in ?? 0), 0);
  const totalShort = items.reduce((s, i) => s + short(i), 0);

  const save = () =>
    startTransition(async () => {
      setError(null);
      const res = await saveEquipmentChecklist({ eventId: event.id, items, notes });
      if (!res.ok) return setError(res.error);
      setDirty(false);
      setMessage("Checklist saved.");
      router.refresh();
    });
  const sign = (key: SignatureKey, on: boolean) =>
    startTransition(async () => {
      setError(null);
      if (on && dirty) {
        const saveRes = await saveEquipmentChecklist({ eventId: event.id, items, notes });
        if (!saveRes.ok) return setError(saveRes.error);
        setDirty(false);
      }
      const res = await signEquipmentChecklist(event.id, key, on);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  const addItem = () => {
    const name = newItem.name.trim();
    if (!name) return;
    if (items.some((i) => i.name.toLowerCase() === name.toLowerCase())) return setError(`${name} is already on the list.`);
    setItems((list) => [...list, { name, side: newItem.side, out: null, in: null }]);
    setNewItem({ name: "", side: newItem.side });
    setDirty(true);
    setError(null);
  };

  const used = items.filter((i) => (i.out ?? 0) > 0 || (i.in ?? 0) > 0);
  const exportItems = used.length ? used : items;
  const dateText = event.date ? formatMalaysiaDate(`${event.date}T12:00:00+08:00`) : "—";
  const table: ExportTable = {
    title: `CATERING EQUIPMENT - ${event.client}`,
    subtitle: `Event date: ${dateText} · Event time: ${formatTime12(event.eventTime) || "-"} · Set-up time: ${formatTime12(event.setupTime) || "-"} · No. of pax: ${event.pax ?? "-"}`,
    columns: ["Description", "Out (pcs)", "In (pcs)", "Missing (pcs)"],
    rows: [
      ...exportItems.map((i) => [i.name, i.out === null ? "" : String(i.out), i.in === null ? "" : String(i.in), short(i) ? String(short(i)) : ""]),
      ["TOTAL", String(totalOut), String(totalIn), totalShort ? String(totalShort) : ""],
      ["", "", "", ""],
      ...SIGNATURES.map((s) => [s.label, signatures[s.key]?.name ?? "", signatures[s.key]?.at ? formatMalaysiaDateTime(signatures[s.key]!.at) : "", ""]),
    ],
  };

  const column = (side: "left" | "right") => {
    const list = items.filter((i) => i.side === side && (!onlyUsed || (i.out ?? 0) > 0 || (i.in ?? 0) > 0));
    return (
      <div className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="grid grid-cols-[1fr_4.5rem_4.5rem_4rem] items-end border-b border-border bg-surface-alt px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-text-muted">
          <div>Description</div>
          <div className="text-center">Out<div className="text-[10px] font-semibold normal-case">pcs</div></div>
          <div className="text-center">In<div className="text-[10px] font-semibold normal-case">pcs</div></div>
          <div className="text-center">Missing</div>
        </div>
        {list.length === 0 ? (
          <div className="px-4 py-5 text-center text-[13px] text-text-muted">No items.</div>
        ) : (
          list.map((i) => {
            const miss = short(i);
            return (
              <div key={i.name} className={`grid grid-cols-[1fr_4.5rem_4.5rem_4rem] items-center border-b border-border px-4 py-1.5 text-[13px] last:border-b-0 ${miss ? "bg-danger-bg/60" : ""}`}>
                <div className="pr-2 text-text">{i.name}</div>
                <div className="text-center">
                  <input type="number" inputMode="numeric" min={0} value={i.out ?? ""} onChange={(e) => setCount(i.name, "out", e.target.value)} className={num} aria-label={`${i.name} out`} />
                </div>
                <div className="text-center">
                  <input type="number" inputMode="numeric" min={0} value={i.in ?? ""} onChange={(e) => setCount(i.name, "in", e.target.value)} className={num} aria-label={`${i.name} in`} />
                </div>
                <div className={`text-center font-bold ${miss ? "text-danger" : "text-text-muted"}`}>{miss || ""}</div>
              </div>
            );
          })
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="mb-3 text-center text-[16px] font-extrabold tracking-wide text-text">CATERING EQUIPMENT</div>
        <div className="grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-3">
          <div><span className="text-text-secondary">Client: </span><span className="font-semibold text-text">{event.client}</span></div>
          <div><span className="text-text-secondary">No. of pax: </span><span className="font-semibold text-text">{event.pax ?? "—"}</span></div>
          <div><span className="text-text-secondary">Event time: </span><span className="font-semibold text-text">{formatTime12(event.eventTime) || "—"}</span></div>
          <div><span className="text-text-secondary">Venue: </span><span className="text-text">{event.venue || "—"}</span></div>
          <div><span className="text-text-secondary">Event date: </span><span className="font-semibold text-text">{dateText}</span></div>
          <div><span className="text-text-secondary">Set-up time: </span><span className="font-semibold text-text">{formatTime12(event.setupTime) || "—"}</span></div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <label className="flex items-center gap-2 text-[13px] text-text-secondary">
          <input type="checkbox" checked={onlyUsed} onChange={(e) => setOnlyUsed(e.target.checked)} />
          Show only the items used
        </label>
        <div className="text-[13px] text-text-secondary">
          Out: <b className="text-text">{totalOut}</b> pcs · In: <b className="text-text">{totalIn}</b> pcs
          {totalShort > 0 && <span className="ml-1 font-bold text-danger">· Missing: {totalShort} pcs</span>}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={() => downloadTableExcel(table)}>Export Excel</button>
          <button type="button" className={btn} onClick={() => printTablePdf(table, window.open("", "_blank"))}>Print</button>
          <button type="button" disabled={pending || (!dirty && saved)} onClick={save} className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white disabled:opacity-50">
            {pending ? "Saving…" : "Save checklist"}
          </button>
        </div>
      </div>
      {error && <div className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}
      {message && <div className="rounded-lg bg-success-bg px-3 py-2 text-[13px] text-success">{message}</div>}
      {dirty && <div className="rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-[13px] font-semibold text-warning">You have changes that are not saved yet. Press Save checklist.</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        {column("left")}
        {column("right")}
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
          Add an item not on the list
          <input value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} placeholder="e.g. Water Dispenser" className="h-9 w-64 rounded-lg border border-border-strong px-3 text-[13px] text-text" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
          Column
          <select value={newItem.side} onChange={(e) => setNewItem({ ...newItem, side: e.target.value as "left" | "right" })} className="h-9 rounded-lg border border-border-strong bg-surface px-2 text-[13px] text-text">
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </label>
        <button type="button" onClick={addItem} className={btn}>+ Add item</button>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
          Notes (broken or missing items, remarks)
          <textarea rows={2} value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); }} className="rounded-lg border border-border-strong px-3 py-2 text-[13px] font-normal text-text" />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SIGNATURES.map((s) => {
          const sig = signatures[s.key];
          return (
            <div key={s.key} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{s.label}</div>
              {sig ? (
                <>
                  <div className="mt-1.5 text-[13.5px] font-semibold text-text">{sig.name}</div>
                  <div className="text-[12px] text-text-secondary">{sig.at ? formatMalaysiaDateTime(sig.at) : ""}</div>
                  {sig.mine && (
                    <button type="button" disabled={pending} onClick={() => sign(s.key, false)} className="mt-2 text-[12px] font-semibold text-text-secondary hover:text-danger">Remove my signature</button>
                  )}
                </>
              ) : (
                <>
                  <div className="mt-1.5 text-[13px] text-text-muted">Not signed yet</div>
                  <button type="button" disabled={pending} onClick={() => sign(s.key, true)} className="mt-2 h-8 rounded-lg bg-primary px-3 text-[12.5px] font-semibold text-white disabled:opacity-50">Sign</button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
