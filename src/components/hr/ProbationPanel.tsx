"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";
import { StatusBadge } from "@/components/StatusBadge";
import { Select } from "@/components/ui/Select";
import { fileTypeFromMime, uploadDocument } from "@/lib/documents/upload";
import { downloadLetterPdf, letterPdfFile } from "@/lib/hr/letterPdf";
import {
  CONFIRMATION_LETTER_LABEL,
  EVENT_STATUS_LABEL,
  EXTENSION_REASONS,
  PROBATION_STATUS_LABEL,
  addDays,
  formatShortDate,
  probationEndDate,
  reasonLabel,
  type ProbationStatus,
} from "@/lib/hr/probation";
import type { ProbationEvent, ProbationRow } from "@/lib/hr/probationQueries";
import {
  cancelLetter,
  decideApproval,
  issueLetter,
  readOfferLetter,
  recordConfirmed,
  requestExtension,
  saveFromOfferLetter,
  saveLetterDraft,
  saveProbationDetails,
  startConfirmation,
  submitForApproval,
  type OfferLetterReading,
} from "@/lib/hr/probationActions";

const inputClass = "mt-1 h-10 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const textareaClass = "mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[12px] font-semibold text-text-secondary";
const btn = "h-9 whitespace-nowrap rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-text hover:bg-surface-alt disabled:opacity-50";
const btnPrimary = "h-9 whitespace-nowrap rounded-lg bg-primary px-4 text-[13px] font-semibold text-white disabled:opacity-60";

const STATUS_TONE: Record<ProbationStatus, "success" | "warning" | "danger" | "info" | "neutral"> = {
  on_probation: "info",
  review_required: "warning",
  probation_extended: "warning",
  pending_confirmation: "danger",
  confirmed: "success",
};

export type PanelProps = {
  employeeId: string;
  companyId: string;
  companyName: string;
  employeeName: string;
  probation: ProbationRow | null;
  events: ProbationEvent[];
  status: ProbationStatus | null;
  userId: string;
  today: string;
  /** the first probation of the page carries the #probation link target */
  anchor?: boolean;
};

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  const empty = value === null || value === undefined || value === "" || value === "-";
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</div>
      <div className={`mt-0.5 text-[14px] leading-snug ${empty ? "text-text-muted" : "font-semibold text-text"}`}>{empty ? "—" : value}</div>
    </div>
  );
}

function Notice({ tone, children }: { tone: "info" | "warning" | "danger"; children: React.ReactNode }) {
  const cls = tone === "danger" ? "border-danger/30 bg-danger-bg text-danger" : tone === "warning" ? "border-warning/30 bg-warning-bg text-text" : "border-[#CFE1F2] bg-info-bg text-[#0F3A63]";
  return <div className={`rounded-lg border px-3.5 py-2.5 text-[13px] ${cls}`}>{children}</div>;
}

export function ProbationPanel(props: PanelProps) {
  const { probation, events, status, today } = props;
  const router = useRouter();
  const [mode, setMode] = useState<null | "details" | "upload" | "extend" | "confirm" | "recorded">(null);
  const [error, setError] = useState<string | null>(null);

  const open = events.find((e) => (e.kind === "extension" || e.kind === "confirmation") && ["draft", "pending_approval", "approved"].includes(e.status)) ?? null;
  const finish = () => {
    setMode(null);
    setError(null);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4" id={props.anchor === false ? undefined : "probation"}>
      {error && <Notice tone="danger">{error}</Notice>}

      {!probation ? (
        <div className="flex flex-col gap-3">
          <p className="text-[13.5px] text-text-secondary">There is no probation record for {props.employeeName} yet. Upload the offer letter (the system reads the start date and probation period) or enter the details by hand.</p>
          {mode === null && (
            <div className="flex flex-wrap gap-2">
              <button className={btnPrimary} onClick={() => setMode("upload")}>Upload offer letter</button>
              <button className={btn} onClick={() => setMode("details")}>Enter details by hand</button>
            </div>
          )}
        </div>
      ) : (
        <>
          {probation.needs_verification && (
            <Notice tone="warning">
              <b>Please verify.</b> {probation.verification_note ?? "Some details are missing or not confirmed."}
            </Notice>
          )}
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <Item label="Status" value={status ? <StatusBadge tone={STATUS_TONE[status]}>{PROBATION_STATUS_LABEL[status]}</StatusBadge> : null} />
            <Item label="Employment Start Date" value={probation.start_date ? formatShortDate(probation.start_date) : null} />
            <Item label="Probation Period" value={probation.probation_months ? `${probation.probation_months} month${probation.probation_months === 1 ? "" : "s"}` : null} />
            <Item label="Position (offer letter)" value={probation.position_in_letter} />
            <Item label="Original Probation End" value={probation.original_end_date ? formatShortDate(probation.original_end_date) : null} />
            <Item label="Current Probation End" value={probation.current_end_date ? formatShortDate(probation.current_end_date) : null} />
            <Item label="Confirmation Letter" value={CONFIRMATION_LETTER_LABEL[probation.confirmation_letter_status] ?? probation.confirmation_letter_status} />
            <Item
              label="Offer Letter"
              value={
                probation.offer_letter_document_id ? (
                  <DocumentViewLink documentId={probation.offer_letter_document_id} label="📎 View offer letter" className="text-[13px] font-semibold text-primary hover:underline" />
                ) : (
                  <span className="text-text-muted">Not uploaded yet</span>
                )
              }
            />
            {probation.is_confirmed && <Item label="Confirmed On" value={formatShortDate(probation.confirmed_date)} />}
            <Item label="Source of the dates" value={probation.source === "offer_letter" ? "Offer letter" : probation.source === "hr_record" ? "HR record (join date)" : "Typed by HR"} />
          </div>

          {mode === null && !open && (
            <div className="flex flex-wrap gap-2">
              <button className={btn} onClick={() => setMode("details")}>{probation.needs_verification ? "Verify / edit details" : "Edit details"}</button>
              <button className={btn} onClick={() => setMode("upload")}>{probation.offer_letter_document_id ? "Replace offer letter" : "Upload offer letter"}</button>
              {!probation.is_confirmed && probation.current_end_date && (
                <>
                  <button className={btn} onClick={() => setMode("extend")}>Extend probation</button>
                  <button className={btnPrimary} onClick={() => setMode("confirm")}>Prepare confirmation letter</button>
                  <button className={btn} onClick={() => setMode("recorded")}>Already confirmed earlier</button>
                </>
              )}
            </div>
          )}
        </>
      )}

      {mode === "upload" && <OfferLetterUpload {...props} onDone={finish} onCancel={() => setMode(null)} />}
      {mode === "details" && <DetailsForm {...props} onDone={finish} onCancel={() => setMode(null)} />}
      {mode === "extend" && probation && <ExtendForm {...props} probation={probation} onDone={finish} onCancel={() => setMode(null)} />}
      {mode === "confirm" && probation && <ConfirmStart {...props} probation={probation} onDone={finish} onCancel={() => setMode(null)} />}
      {mode === "recorded" && probation && <RecordedForm probation={probation} today={today} onDone={finish} onCancel={() => setMode(null)} />}

      {open && probation && <LetterCard key={open.id} event={open} {...props} onChange={() => router.refresh()} />}

      {events.length > 0 && <History events={events} />}
    </div>
  );
}

// ---------- offer letter upload ----------

function OfferLetterUpload(props: PanelProps & { onDone: () => void; onCancel: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [reading, setReading] = useState<OfferLetterReading | null>(null);
  const [form, setForm] = useState({ startDate: "", months: "", position: "", letterDate: "" });

  async function readIt() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const doc = await uploadDocument({ companyId: props.companyId, module: "hr", fileType: fileTypeFromMime(file), file });
      setDocumentId(doc.id);
      const result = await readOfferLetter(doc.id, props.employeeId);
      if (!result.ok) {
        setError(result.error);
        setForm((f) => ({ ...f, startDate: props.probation?.start_date ?? "", months: props.probation?.probation_months ? String(props.probation.probation_months) : "" }));
        setReading({ data: { name: null, letterDate: null, startDate: null, position: null, months: null, issues: [] }, nameMatches: true, note: null });
        return;
      }
      setReading(result.reading);
      setForm({
        startDate: result.reading.data.startDate ?? "",
        months: result.reading.data.months ? String(result.reading.data.months) : "",
        position: result.reading.data.position ?? "",
        letterDate: result.reading.data.letterDate ?? "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!documentId) return;
    setBusy(true);
    setError(null);
    const result = await saveFromOfferLetter({ employeeId: props.employeeId, documentId, startDate: form.startDate, months: Number(form.months), position: form.position, letterDate: form.letterDate || undefined });
    setBusy(false);
    if (!result.ok) setError(result.error);
    else props.onDone();
  }

  const end = form.startDate && Number(form.months) >= 1 ? probationEndDate(form.startDate, Number(form.months)) : null;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-strong p-4">
      <div className="text-[13.5px] font-bold text-text">Upload offer letter</div>
      {error && <Notice tone="danger">{error}</Notice>}
      {!reading ? (
        <>
          <p className="text-[12.5px] text-text-secondary">Choose the offer letter (Word or PDF). The system reads the start date, position and probation period, and you check them before saving. The letter is kept in the staff profile.</p>
          <input type="file" accept=".docx,.doc,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
          <div className="flex gap-2">
            <button className={btnPrimary} disabled={!file || busy} onClick={readIt}>{busy ? "Reading the letter..." : "Upload & read"}</button>
            <button className={btn} onClick={props.onCancel}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          {reading.data.issues.length > 0 ? (
            <Notice tone="warning">
              <b>Please check:</b>
              <ul className="ml-4 list-disc">{reading.data.issues.map((i) => <li key={i}>{i}</li>)}</ul>
            </Notice>
          ) : (
            <Notice tone="info">The details below were read from the letter. Check them, then save.</Notice>
          )}
          <DetailFields form={form} setForm={setForm} end={end} />
          <div className="flex gap-2">
            <button className={btnPrimary} disabled={busy || !form.startDate || !form.months} onClick={save}>{busy ? "Saving..." : "Save probation"}</button>
            <button className={btn} onClick={props.onCancel}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}

function DetailFields({ form, setForm, end }: { form: { startDate: string; months: string; position: string; letterDate: string }; setForm: (f: (p: typeof form) => typeof form) => void; end: string | null }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <label className={labelClass}>Employment start date *</label>
        <input type="date" className={inputClass} value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
      </div>
      <div>
        <label className={labelClass}>Probation period (months) *</label>
        <input type="number" min={1} max={12} className={inputClass} value={form.months} onChange={(e) => setForm((f) => ({ ...f, months: e.target.value }))} />
      </div>
      <div>
        <label className={labelClass}>Position (offer letter)</label>
        <input className={inputClass} value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} />
      </div>
      <div>
        <label className={labelClass}>Date of the offer letter</label>
        <input type="date" className={inputClass} value={form.letterDate} onChange={(e) => setForm((f) => ({ ...f, letterDate: e.target.value }))} />
      </div>
      <div className="text-[12.5px] text-text-secondary sm:col-span-2 lg:col-span-4">
        Probation ends on: <b className="text-text">{end ? formatShortDate(end) : "-"}</b> (the day before the same date {form.months || "N"} month(s) after the start date)
      </div>
    </div>
  );
}

// ---------- edit the details ----------

function DetailsForm(props: PanelProps & { onDone: () => void; onCancel: () => void }) {
  const p = props.probation;
  const [form, setForm] = useState({ startDate: p?.start_date ?? "", months: p?.probation_months ? String(p.probation_months) : "", position: p?.position_in_letter ?? "", letterDate: p?.letter_date ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = props.events.some((e) => e.kind === "extension" && e.status !== "rejected");
  const end = form.startDate && Number(form.months) >= 1 ? probationEndDate(form.startDate, Number(form.months)) : null;

  async function save() {
    setBusy(true);
    setError(null);
    const result = await saveProbationDetails({ employeeId: p?.employee_id ?? props.employeeId, startDate: form.startDate, months: Number(form.months), position: form.position, letterDate: form.letterDate || undefined, source: p ? undefined : "manual" });
    setBusy(false);
    if (!result.ok) setError(result.error);
    else props.onDone();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-strong p-4">
      <div className="text-[13.5px] font-bold text-text">{p ? "Check / correct the probation details" : "Enter the probation details"}</div>
      {error && <Notice tone="danger">{error}</Notice>}
      {locked && <Notice tone="warning">An extension has been recorded, so the start date and probation period are locked (the original dates are kept). Only the position and letter date can be changed.</Notice>}
      <fieldset disabled={locked} className="contents">
        <DetailFields form={form} setForm={setForm} end={end} />
      </fieldset>
      <div className="flex gap-2">
        <button className={btnPrimary} disabled={busy || !form.startDate || !form.months} onClick={save}>{busy ? "Saving..." : "Save & mark as verified"}</button>
        <button className={btn} onClick={props.onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ---------- extension ----------

function ExtendForm(props: PanelProps & { probation: ProbationRow; onDone: () => void; onCancel: () => void }) {
  const current = props.probation.current_end_date as string;
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [months, setMonths] = useState("1");
  const [newEnd, setNewEnd] = useState(probationEndDate(addDays(current, 1), 1));
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickMonths(m: string) {
    setMonths(m);
    if (m !== "custom") setNewEnd(probationEndDate(addDays(current, 1), Number(m)));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      let evidenceDocumentId: string | undefined;
      if (file) evidenceDocumentId = (await uploadDocument({ companyId: props.companyId, module: "hr", fileType: fileTypeFromMime(file), file, skipMarkdown: true })).id;
      const result = await requestExtension({ probationId: props.probation.id, reason, notes, evidenceDocumentId, newEndDate: newEnd });
      if (!result.ok) setError(result.error);
      else props.onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-strong p-4">
      <div className="text-[13.5px] font-bold text-text">Extend probation</div>
      <Notice tone="warning">
        An extension is a decision for management. Poor performance or misconduct does not extend the probation (or end the employment) by itself: check the offer letter / contract and the applicable Malaysian employment requirements, review the case with management, then prepare the letter. Nothing changes until management approves.
      </Notice>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Reason *</label>
          <Select className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Select the reason</option>
            {EXTENSION_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Extension</label>
            <Select className={inputClass} value={months} onChange={(e) => pickMonths(e.target.value)}>
              <option value="1">1 month</option>
              <option value="2">2 months</option>
              <option value="3">3 months</option>
              <option value="custom">Choose a date</option>
            </Select>
          </div>
          <div>
            <label className={labelClass}>New end date *</label>
            <input type="date" className={inputClass} value={newEnd} min={addDays(current, 1)} onChange={(e) => { setNewEnd(e.target.value); setMonths("custom"); }} />
          </div>
        </div>
      </div>
      <div className="text-[12.5px] text-text-secondary">Original end date: <b className="text-text">{formatShortDate(props.probation.original_end_date)}</b> · Current end date: <b className="text-text">{formatShortDate(current)}</b> · New end date: <b className="text-text">{formatShortDate(newEnd)}</b></div>
      <div>
        <label className={labelClass}>Notes * (what happened, what was discussed with the staff member)</label>
        <textarea rows={4} className={textareaClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div>
        <label className={labelClass}>Supporting evidence (optional: PDF or photo)</label>
        <input type="file" accept="application/pdf,image/*,.docx,.xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block text-sm" />
      </div>
      <div className="flex gap-2">
        <button className={btnPrimary} disabled={busy || !reason || !notes.trim() || !newEnd} onClick={save}>{busy ? "Saving..." : "Prepare extension letter draft"}</button>
        <button className={btn} onClick={props.onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ---------- confirmation ----------

function ConfirmStart(props: PanelProps & { probation: ProbationRow; onDone: () => void; onCancel: () => void }) {
  const [date, setDate] = useState(addDays(props.probation.current_end_date as string, 1) > props.today ? addDays(props.probation.current_end_date as string, 1) : props.today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    const result = await startConfirmation(props.probation.id, date);
    setBusy(false);
    if (!result.ok) setError(result.error);
    else props.onDone();
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-strong p-4">
      <div className="text-[13.5px] font-bold text-text">Prepare confirmation letter</div>
      <p className="text-[12.5px] text-text-secondary">Use this when {props.employeeName} has passed probation after the performance review. The letter is filled in for you; you can edit it before it goes to management.</p>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="max-w-xs">
        <label className={labelClass}>Confirmation takes effect on *</label>
        <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <button className={btnPrimary} disabled={busy || !date} onClick={go}>{busy ? "Preparing..." : "Prepare letter draft"}</button>
        <button className={btn} onClick={props.onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function RecordedForm({ probation, today, onDone, onCancel }: { probation: ProbationRow; today: string; onDone: () => void; onCancel: () => void }) {
  const [date, setDate] = useState(probation.current_end_date ? addDays(probation.current_end_date, 1) : today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    const result = await recordConfirmed(probation.id, date, note);
    setBusy(false);
    if (!result.ok) setError(result.error);
    else onDone();
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-strong p-4">
      <div className="text-[13.5px] font-bold text-text">Already confirmed earlier</div>
      <p className="text-[12.5px] text-text-secondary">For staff who were confirmed before this tracker was used. The date is recorded in the history; no new letter is made.</p>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Date confirmed *</label>
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Note (optional)</label>
          <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <button className={btnPrimary} disabled={busy || !date} onClick={go}>{busy ? "Saving..." : "Record as confirmed"}</button>
        <button className={btn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ---------- the letter in progress ----------

function LetterCard({ event, onChange, ...props }: PanelProps & { event: ProbationEvent; onChange: () => void }) {
  const [text, setText] = useState(event.letter_text ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = event.kind === "extension" ? "Probation Extension Letter" : "Confirmation Letter";
  const filename = `${title} - ${props.employeeName}.pdf`;
  const mine = event.requested_by === props.userId;

  async function run(work: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    try {
      const result = await work();
      if (!result.ok) setError(result.error ?? "Something went wrong.");
      else onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function issue() {
    await run(async () => {
      const file = letterPdfFile({ companyName: props.companyName, text, filename });
      const doc = await uploadDocument({ companyId: props.companyId, module: "hr", fileType: "pdf", file, skipMarkdown: true });
      return issueLetter(event.id, doc.id);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-info-bg/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[13.5px] font-bold text-text">{title}</div>
        <StatusBadge tone={event.status === "approved" ? "success" : event.status === "pending_approval" ? "warning" : "neutral"}>{EVENT_STATUS_LABEL[event.status]}</StatusBadge>
      </div>
      {event.kind === "extension" && (
        <div className="grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-3">
          <Item label="Reason" value={reasonLabel(event.reason)} />
          <Item label="Extension" value={`${formatShortDate(event.previous_end_date)} → ${formatShortDate(event.new_end_date)}`} />
          <Item label="Prepared by" value={event.requested_by_name} />
          <div className="sm:col-span-3"><Item label="HR notes" value={<span className="whitespace-pre-line font-normal">{event.notes}</span>} /></div>
          {event.evidence_document_id && <Item label="Evidence" value={<DocumentViewLink documentId={event.evidence_document_id} label="📎 View evidence" className="text-[13px] font-semibold text-primary hover:underline" />} />}
        </div>
      )}
      {event.kind === "confirmation" && <Item label="Takes effect on" value={formatShortDate(event.effective_date)} />}
      {error && <Notice tone="danger">{error}</Notice>}

      <div>
        <label className={labelClass}>{event.status === "draft" ? "Letter (you can edit every word)" : "Letter"}</label>
        <textarea rows={16} className={`${textareaClass} font-mono text-[12.5px]`} value={text} readOnly={event.status !== "draft"} onChange={(e) => setText(e.target.value)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button className={btn} onClick={() => downloadLetterPdf({ companyName: props.companyName, text, filename })}>Download PDF {event.status === "draft" || event.status === "pending_approval" ? "(draft)" : ""}</button>
        {event.status === "draft" && (
          <>
            <button className={btn} disabled={busy} onClick={() => run(() => saveLetterDraft(event.id, text))}>Save draft</button>
            <button className={btnPrimary} disabled={busy} onClick={() => run(() => submitForApproval(event.id, text))}>Send to management for approval</button>
            <button className="h-9 rounded-lg border border-danger/40 px-3.5 text-[13px] font-semibold text-danger" disabled={busy} onClick={() => run(() => cancelLetter(event.id, "Cancelled by HR"))}>Cancel letter</button>
          </>
        )}
        {event.status === "approved" && (
          <button className={btnPrimary} disabled={busy} onClick={issue}>{busy ? "Issuing..." : "Issue letter (save PDF in the staff profile)"}</button>
        )}
      </div>

      {event.status === "pending_approval" && (
        <div className="flex flex-col gap-2 rounded-lg border border-border-strong bg-surface p-3">
          {mine ? (
            <p className="text-[13px] text-text-secondary">Waiting for management. The person who prepared the letter cannot approve it; another Super Admin must approve or reject it here.</p>
          ) : (
            <>
              <p className="text-[13px] text-text">Management approval: do you approve this letter?</p>
              <input className={inputClass} placeholder="Note (required if not approved)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex gap-2">
                <button className={btnPrimary} disabled={busy} onClick={() => run(() => decideApproval(event.id, true, note))}>Approve</button>
                <button className="h-9 rounded-lg border border-danger/40 px-3.5 text-[13px] font-semibold text-danger" disabled={busy} onClick={() => run(() => decideApproval(event.id, false, note))}>Do not approve</button>
              </div>
            </>
          )}
          {mine && <button className={`${btn} self-start`} disabled={busy} onClick={() => run(() => cancelLetter(event.id, "Withdrawn by HR"))}>Withdraw letter</button>}
        </div>
      )}
      {event.status === "approved" && (
        <p className="text-[12.5px] text-text-secondary">Approved by {event.decided_by_name} on {formatShortDate(event.decided_at?.slice(0, 10))}{event.decision_note ? ` - ${event.decision_note}` : ""}. {event.kind === "extension" ? "The new end date is already in force." : "Issue the letter to make the staff member Confirmed."}</p>
      )}
    </div>
  );
}

// ---------- history ----------

function History({ events }: { events: ProbationEvent[] }) {
  const label = (e: ProbationEvent) =>
    e.kind === "extension" ? "Probation extension" : e.kind === "confirmation" ? "Confirmation letter" : e.kind === "recorded" ? "Confirmation recorded" : "Details corrected";
  return (
    <details className="rounded-lg border border-border">
      <summary className="cursor-pointer px-3.5 py-2.5 text-[13px] font-bold text-text">History ({events.length}) - every extension, approval and correction is kept</summary>
      <div className="divide-y divide-border">
        {[...events].reverse().map((e) => (
          <div key={e.id} className="px-3.5 py-3 text-[13px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-text">
                {label(e)}
                {e.kind === "extension" && e.previous_end_date && e.new_end_date ? `: ${formatShortDate(e.previous_end_date)} → ${formatShortDate(e.new_end_date)}` : ""}
              </div>
              <StatusBadge tone={e.status === "issued" || e.status === "approved" ? "success" : e.status === "rejected" ? "danger" : "neutral"}>{EVENT_STATUS_LABEL[e.status]}</StatusBadge>
            </div>
            <div className="mt-0.5 text-text-secondary">
              {formatShortDate(e.created_at.slice(0, 10))} · by {e.requested_by_name ?? "-"}
              {e.reason ? ` · ${reasonLabel(e.reason)}` : ""}
            </div>
            {e.notes && <div className="mt-1 whitespace-pre-line text-text-secondary">{e.notes}</div>}
            {e.decided_by_name && (
              <div className="mt-1 text-text-secondary">
                {e.status === "rejected" ? "Not approved" : "Approved"} by {e.decided_by_name} on {formatShortDate(e.decided_at?.slice(0, 10))}
                {e.decision_note ? ` - ${e.decision_note}` : ""}
              </div>
            )}
            <div className="mt-1 flex gap-3">
              {e.evidence_document_id && <DocumentViewLink documentId={e.evidence_document_id} label="📎 Evidence" className="text-[12.5px] font-semibold text-primary hover:underline" />}
              {e.issued_document_id && <DocumentViewLink documentId={e.issued_document_id} label="📎 Issued letter" className="text-[12.5px] font-semibold text-primary hover:underline" />}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

