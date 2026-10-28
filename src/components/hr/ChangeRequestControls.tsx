"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/actionResult";
import { cancelStaffChange, decideStaffChange, requestStaffChange } from "@/lib/hr/changeRequests";
import { CHANGE_FIELDS } from "@/lib/hr/changeFields";
import { Select } from "@/components/ui/Select";

const inputClass = "mt-1 h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-[13.5px] outline-none focus:border-primary";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

/** The form of a staff member who asks to change one detail of their own record (it changes only when Madam Penny or Nabilah approves). */
export function RequestChangeForm({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const [field, setField] = useState("");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!field) {
      setError("Choose the detail you want to change.");
      return;
    }
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      const r = await requestStaffChange({ employeeId, field, newValue: value, reason });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setField("");
      setValue("");
      setReason("");
      setSent(true);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not send the request."));
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
      {sent && <div className="rounded-lg border border-success/30 bg-success-bg px-3 py-2 text-[13px] font-semibold text-success">Your request was sent. Madam Penny or Nabilah will answer it.</div>}
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
      <div>
        <label className={labelClass}>Why? (optional)</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. I changed my phone number" className={inputClass} />
      </div>
      <div className="flex justify-end">
        <button type="submit" disabled={busy} className="rounded-lg bg-primary px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-60">
          {busy ? "Sending..." : "Send request"}
        </button>
      </div>
    </form>
  );
}

/** A staff member takes back a request that is still waiting. */
export function CancelRequestButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm("Take back this request?")) return;
          setBusy(true);
          setError(null);
          try {
            const r = await cancelStaffChange(id);
            if (!r.ok) setError(r.error);
            else router.refresh();
          } catch (err) {
            setError(errorMessage(err, "Could not take back the request."));
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-md border border-border-strong px-2.5 py-1 text-[12px] font-semibold text-text-secondary hover:bg-surface-alt disabled:opacity-50"
      >
        Take back
      </button>
      {error && <span className="text-[11.5px] text-danger">{error}</span>}
    </span>
  );
}

/** Madam Penny or Nabilah approves or rejects a request. */
export function DecideChangeButtons({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approved" | "rejected") {
    const note = decision === "rejected" ? window.prompt("Why is it rejected? (the staff member will see this; you can leave it empty)") : "";
    if (note === null) return;
    setBusy(true);
    setError(null);
    try {
      const r = await decideStaffChange(id, decision, note || undefined);
      if (!r.ok) setError(r.error);
      else router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not save the decision."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => decide("approved")} className="rounded-lg bg-success px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">
          Approve
        </button>
        <button type="button" disabled={busy} onClick={() => decide("rejected")} className="rounded-lg border border-danger px-4 py-2 text-[13px] font-bold text-danger disabled:opacity-50">
          Reject
        </button>
      </div>
      {error && <span className="text-[11.5px] text-danger">{error}</span>}
    </div>
  );
}
