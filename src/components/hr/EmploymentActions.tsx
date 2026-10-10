"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordEmploymentEvent, type EmploymentEventInput } from "@/lib/hr/employeeActions";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

type Kind = "confirmation" | "probation_review" | "resignation" | "termination" | "deactivate" | "reactivate";

const TITLE: Record<Kind, string> = {
  confirmation: "Confirm employment",
  probation_review: "Record probation review",
  resignation: "Record resignation",
  termination: "Record termination",
  deactivate: "Set employee inactive",
  reactivate: "Reactivate employee",
};

const inputClass = "mt-1 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12.5px] font-semibold text-text-secondary";

function todayInMalaysia() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

export function EmploymentActions({
  employeeId,
  employeeName,
  status,
  stage,
  probationEnd,
}: {
  employeeId: string;
  employeeName: string;
  status: string;
  stage: string | null;
  probationEnd: string | null;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind | null>(null);
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [effective, setEffective] = useState(todayInMalaysia());
  const [details, setDetails] = useState("");
  const [outcome, setOutcome] = useState<"pass" | "extend" | "fail">("pass");
  const [newEnd, setNewEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const employed = status === "active" || status === "inactive";
  const onProbation = status === "active" && stage === "probation";

  function open(k: Kind) {
    setKind(k);
    setStep("form");
    setEffective(todayInMalaysia());
    setDetails("");
    setOutcome("pass");
    setNewEnd("");
    setError(null);
    setDone(null);
  }

  function close() {
    if (!busy) setKind(null);
  }

  const reasonRequired = kind === "termination" || kind === "deactivate" || kind === "reactivate";

  function review() {
    if (!effective) return setError("Choose the effective date.");
    if (reasonRequired && !details.trim()) return setError("A reason is required.");
    if (kind === "probation_review" && outcome === "extend") {
      if (!newEnd) return setError("Choose the new probation end date.");
      if (probationEnd && newEnd <= probationEnd) return setError("The new end date must be later than the current probation end date.");
    }
    setError(null);
    setStep("confirm");
  }

  async function submit() {
    if (!kind) return;
    setBusy(true);
    setError(null);
    const base = { employeeId, effectiveDate: effective, details: details.trim() || undefined };
    const input: EmploymentEventInput =
      kind === "confirmation" ? { ...base, event: "confirmation" }
      : kind === "probation_review" ? { ...base, event: "probation_review", outcome, newProbationEnd: outcome === "extend" ? newEnd : undefined }
      : kind === "resignation" ? { ...base, event: "resignation" }
      : kind === "termination" ? { ...base, event: "termination" }
      : { ...base, event: "status_change", toStatus: kind === "deactivate" ? "inactive" : "active" };
    try {
      await recordEmploymentEvent(input);
      setKind(null);
      setDone(`${TITLE[kind]} — saved.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStep("form");
    } finally {
      setBusy(false);
    }
  }

  const buttonClass = "rounded-lg border border-border-strong bg-surface px-3 py-2 text-[12.5px] font-semibold text-text hover:bg-surface-alt";

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {onProbation && <button type="button" className={buttonClass} onClick={() => open("probation_review")}>Probation review</button>}
        {onProbation && <button type="button" className={buttonClass} onClick={() => open("confirmation")}>Confirm employment</button>}
        {employed && <button type="button" className={buttonClass} onClick={() => open("resignation")}>Record resignation</button>}
        {employed && <button type="button" className={`${buttonClass} text-danger`} onClick={() => open("termination")}>Record termination</button>}
        {status === "active" && <button type="button" className={buttonClass} onClick={() => open("deactivate")}>Set inactive</button>}
        {status !== "active" && <button type="button" className={buttonClass} onClick={() => open("reactivate")}>Reactivate</button>}
      </div>
      {done && <p role="status" className="mt-2 text-[12.5px] font-semibold text-success">{done}</p>}

      <ConfirmDialog
        open={kind !== null && step === "form"}
        title={kind ? TITLE[kind] : ""}
        confirmLabel="Review"
        onConfirm={review}
        onCancel={close}
        error={error}
      >
        <div className="flex flex-col gap-3">
          <div>
            <label className={labelClass} htmlFor="ev-date">Effective date *</label>
            <input id="ev-date" type="date" value={effective} onChange={(e) => setEffective(e.target.value)} className={inputClass} />
          </div>
          {kind === "probation_review" && (
            <>
              <div>
                <label className={labelClass} htmlFor="ev-outcome">Outcome *</label>
                <select id="ev-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value as "pass" | "extend" | "fail")} className={inputClass}>
                  <option value="pass">Passed</option>
                  <option value="extend">Extend probation</option>
                  <option value="fail">Not passed</option>
                </select>
              </div>
              {outcome === "extend" && (
                <div>
                  <label className={labelClass} htmlFor="ev-end">New probation end date *</label>
                  <input id="ev-end" type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className={inputClass} />
                </div>
              )}
            </>
          )}
          <div>
            <label className={labelClass} htmlFor="ev-details">{reasonRequired ? "Reason *" : "Notes"}</label>
            <textarea id="ev-details" value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={2000} className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" />
            <p className="mt-1 text-[11.5px] text-text-muted">Kept in the employment history. Do not include medical or other sensitive details.</p>
          </div>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={kind !== null && step === "confirm"}
        title={kind ? `Confirm: ${TITLE[kind].toLowerCase()}` : ""}
        confirmLabel="Confirm and save"
        danger={kind === "termination" || kind === "resignation"}
        busy={busy}
        error={error}
        onConfirm={submit}
        onCancel={() => (busy ? undefined : setStep("form"))}
        cancelLabel="Back"
      >
        <p>
          You are about to record <strong>{kind ? TITLE[kind].toLowerCase() : ""}</strong> for <strong>{employeeName}</strong>, effective{" "}
          <strong>{effective}</strong>. This is added to the employment history and the audit log, and it cannot be edited afterwards.
        </p>
      </ConfirmDialog>
    </div>
  );
}
