"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { errorMessage } from "@/lib/actionResult";
import { deleteDelivery, deleteDrivers, deleteMaintenance, deleteVehicles, updateDeliveryQuick, updateMaintenanceQuick, type RecordUndo } from "@/lib/driver/recordActions";
import { rememberDeleted } from "@/components/driver/RecordUndoBanner";
import type { ActionResult } from "@/lib/actionResult";
import { DescriptionInput } from "@/components/DescriptionInput";

const inputClass = "mt-1 h-9 w-full rounded-md border border-border-strong bg-white px-2 text-[13px] outline-none focus:border-primary";
const labelClass = "text-[11.5px] font-semibold text-text-secondary";
const btn = "rounded-md border border-border-strong bg-white px-2.5 py-1 text-[12px] font-semibold text-text hover:border-primary hover:text-primary disabled:opacity-50";

export type RowActionsProps =
  | { kind: "delivery"; id: string; initial: { scheduledTime: string; location: string; itemsDescription: string; notes: string }; fullEditHref: string }
  | { kind: "maintenance"; id: string; initial: { serviceDate: string; nextServiceDate: string; cost: string; notes: string } }
  | { kind: "vehicle"; ids: string[]; editHref: string }
  | { kind: "driver"; ids: string[]; editHref: string };

const CONFIRM: Record<RowActionsProps["kind"], string> = {
  delivery: "Delete this delivery? You can undo it right after.",
  maintenance: "Delete this service record? You can undo it right after.",
  vehicle: "Delete this vehicle and its service records? You can undo it right after.",
  driver: "Remove this driver profile? The person stays in HR. You can undo it right after.",
};

/** Edit (Save / Cancel) and Delete (with Undo) buttons of one row of the Operation Management lists. */
export function OperationRowActions(props: RowActionsProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>(props.kind === "vehicle" || props.kind === "driver" ? {} : { ...props.initial });
  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function run(work: () => Promise<ActionResult<object>>, after?: (r: Record<string, unknown>) => void) {
    setBusy(true);
    setError(null);
    try {
      const r = (await work()) as { ok: boolean; error?: string } & Record<string, unknown>;
      if (!r.ok) {
        setError(r.error ?? "Something went wrong.");
        return;
      }
      after?.(r);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Something went wrong."));
    } finally {
      setBusy(false);
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (props.kind === "delivery") {
      void run(() => updateDeliveryQuick({ id: props.id, scheduledTime: form.scheduledTime, location: form.location, itemsDescription: form.itemsDescription, notes: form.notes }), () => setEditing(false));
    } else if (props.kind === "maintenance") {
      void run(() => updateMaintenanceQuick({ id: props.id, serviceDate: form.serviceDate, nextServiceDate: form.nextServiceDate, cost: Number(form.cost), notes: form.notes }), () => setEditing(false));
    }
  }

  function remove() {
    if (!window.confirm(t(CONFIRM[props.kind]))) return;
    const work: () => Promise<ActionResult<{ undo: RecordUndo }>> =
      props.kind === "delivery" ? () => deleteDelivery(props.id)
      : props.kind === "maintenance" ? () => deleteMaintenance(props.id)
      : props.kind === "vehicle" ? () => deleteVehicles(props.ids)
      : () => deleteDrivers(props.ids);
    void run(work, (r) => rememberDeleted(r.undo as RecordUndo));
  }

  const inline = props.kind === "delivery" || props.kind === "maintenance";

  return (
    <div className="flex flex-col gap-2">
      {!editing && (
        <div className="flex flex-wrap items-center gap-1.5">
          {inline ? (
            <button type="button" disabled={busy} onClick={() => setEditing(true)} className={btn}>
              Edit
            </button>
          ) : (
            <Link href={props.editHref} className={btn}>
              Edit
            </Link>
          )}
          <button type="button" disabled={busy} onClick={remove} className={`${btn} text-danger`}>
            Delete
          </button>
          {props.kind === "delivery" && (
            <Link href={props.fullEditHref} className="text-[12px] font-semibold text-text-secondary hover:underline">
              Full edit (driver, vehicle, status)
            </Link>
          )}
        </div>
      )}

      {editing && inline && (
        <form onSubmit={save} className="rounded-lg border border-border bg-white p-3">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {props.kind === "delivery" && (
              <>
                <div className="sm:col-span-1">
                  <label className={labelClass}>Scheduled Time *</label>
                  <input type="datetime-local" required value={form.scheduledTime} onChange={(e) => set("scheduledTime", e.target.value)} className={inputClass} />
                </div>
                <div className="sm:col-span-3">
                  <label className={labelClass}>Location</label>
                  <input value={form.location} onChange={(e) => set("location", e.target.value)} className={inputClass} />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Items</label>
                  <DescriptionInput value={form.itemsDescription} onChange={(v) => set("itemsDescription", v)} className={inputClass} />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Notes</label>
                  <input value={form.notes} onChange={(e) => set("notes", e.target.value)} className={inputClass} />
                </div>
              </>
            )}
            {props.kind === "maintenance" && (
              <>
                <div>
                  <label className={labelClass}>Service Date *</label>
                  <input type="date" required value={form.serviceDate} onChange={(e) => set("serviceDate", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Next Service</label>
                  <input type="date" value={form.nextServiceDate} onChange={(e) => set("nextServiceDate", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Cost (RM) *</label>
                  <input type="number" required min={0} step="0.01" value={form.cost} onChange={(e) => set("cost", e.target.value)} className={inputClass} />
                </div>
                <div className="col-span-2 sm:col-span-4">
                  <label className={labelClass}>Notes</label>
                  <input value={form.notes} onChange={(e) => set("notes", e.target.value)} className={inputClass} />
                </div>
              </>
            )}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button type="submit" disabled={busy} className="rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-60">
              {busy ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setError(null);
                setForm({ ...props.initial });
              }}
              className={btn}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && <div role="alert" className="text-[12px] text-danger">{error}</div>}
    </div>
  );
}
