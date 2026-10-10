"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createDepartment, renameDepartment, setDepartmentActive } from "@/lib/hr/employeeActions";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { StatusBadge } from "@/components/StatusBadge";

type Dept = { id: string; name: string; is_active: boolean };

const inputClass = "h-10 rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";

export function DepartmentManager({ companyId, departments }: { companyId: string; departments: Dept[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [toggle, setToggle] = useState<Dept | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ tone: "success", text: success });
      router.refresh();
      return true;
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Something went wrong." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setMessage({ tone: "error", text: "Enter a department name." });
    if (await run(() => createDepartment(companyId, name), "Department added.")) setName("");
  }

  async function saveRename() {
    if (!editing) return;
    if (!editing.name.trim()) return setMessage({ tone: "error", text: "Enter a department name." });
    if (await run(() => renameDepartment(editing.id, editing.name), "Department renamed.")) setEditing(null);
  }

  async function confirmToggle() {
    if (!toggle) return;
    setBusy(true);
    setToggleError(null);
    try {
      await setDepartmentActive(toggle.id, !toggle.is_active);
      setToggle(null);
      router.refresh();
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row" noValidate>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New department name" maxLength={100} className={`${inputClass} sm:w-72`} aria-label="New department name" />
        <button type="submit" disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">Add department</button>
      </form>
      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`text-[12.5px] font-semibold ${message.tone === "error" ? "text-danger" : "text-success"}`}>
          {message.text}
        </p>
      )}

      {departments.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-text-muted">No departments yet for this company.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {departments.map((d) => (
            <li key={d.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              {editing?.id === d.id ? (
                <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                  <input value={editing.name} onChange={(e) => setEditing({ id: d.id, name: e.target.value })} maxLength={100} className={`${inputClass} sm:w-72`} aria-label="Department name" />
                  <button type="button" onClick={saveRename} disabled={busy} className="rounded-lg bg-primary px-3 py-2 text-[12.5px] font-semibold text-white disabled:opacity-60">Save</button>
                  <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-border-strong px-3 py-2 text-[12.5px] font-semibold text-text">Cancel</button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <span className={`text-[13.5px] font-semibold ${d.is_active ? "text-text" : "text-text-muted"}`}>{d.name}</span>
                    {!d.is_active && <StatusBadge tone="neutral">Inactive</StatusBadge>}
                  </div>
                  <div className="flex gap-4">
                    <button type="button" onClick={() => setEditing({ id: d.id, name: d.name })} className="text-[12.5px] font-semibold text-primary">Rename</button>
                    <button type="button" onClick={() => { setToggleError(null); setToggle(d); }} className="text-[12.5px] font-semibold text-text-secondary">
                      {d.is_active ? "Mark inactive" : "Reactivate"}
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={toggle !== null}
        title={toggle?.is_active ? "Mark department inactive?" : "Reactivate department?"}
        confirmLabel={toggle?.is_active ? "Mark inactive" : "Reactivate"}
        busy={busy}
        error={toggleError}
        onConfirm={confirmToggle}
        onCancel={() => (busy ? undefined : setToggle(null))}
      >
        <p>
          <strong>{toggle?.name}</strong>{" "}
          {toggle?.is_active
            ? "will no longer be offered for new employees. Existing employees and history keep it — nothing is deleted."
            : "will be offered for employees again."}
        </p>
      </ConfirmDialog>
    </div>
  );
}
