"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/actionResult";
import { updateMyDetail } from "@/lib/hr/selfEdit";
import { CHANGE_FIELDS } from "@/lib/hr/changeFields";
import { Select } from "@/components/ui/Select";

const inputClass = "mt-1 h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-[13.5px] outline-none focus:border-primary";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

/** A staff member changes one detail of their own record. The change is saved straight away and recorded with their name. */
export function MyDetailsEdit({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const [field, setField] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!field) {
      setError("Choose the detail you want to change.");
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const r = await updateMyDetail({ employeeId, field, newValue: value });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setField("");
      setValue("");
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not save the change."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {error && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">
          {error}
        </div>
      )}
      {saved && <div className="rounded-lg border border-success/30 bg-success-bg px-3 py-2 text-[13px] font-semibold text-success">Saved. The change is recorded with your name.</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Which detail do you want to change? *</label>
          <Select value={field} onChange={(e) => setField(e.target.value)} required className={inputClass}>
            <option value="">Select the detail</option>
            {CHANGE_FIELDS.map((f) => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className={labelClass}>What should it be? *</label>
          <input value={value} onChange={(e) => setValue(e.target.value)} required maxLength={200} className={inputClass} />
        </div>
      </div>
      <div className="flex justify-end">
        <button type="submit" disabled={busy} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-60">
          {busy ? "Saving..." : "Save change"}
        </button>
      </div>
    </form>
  );
}
