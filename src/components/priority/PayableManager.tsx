"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  confirmPayment,
  decidePaymentRequest,
  overridePriority,
  requestPayment,
  saveControlNote,
  setHold,
  setOperationalAlert,
  setUrgent,
  startPaymentProcessing,
  verifyBalance,
  withdrawPaymentRequest,
} from "@/lib/priority/paymentActions";
import { getPayableHistory } from "@/lib/priority/historyActions";
import { attachTaskProof } from "@/lib/taskProofs/actions";
import { fileTypeFromMime, uploadDocument } from "@/lib/documents/upload";
import { formatMalaysiaDateTime, formatPrice } from "@/lib/format";
import {
  APPROVAL_LABEL,
  APPROVAL_TONE,
  OPS_ALERT_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
  PRIORITY_LABEL,
  PRIORITY_TONE,
  type LedgerEntry,
  type OpsAlertType,
  type PayableView,
  type PriorityLevel,
} from "@/lib/priority/payables";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";
import { AREA, BTN, BTN_GHOST, BTN_SM, BTN_SM_GHOST, Dialog, ErrorLine, FIELD, LABEL, Pill } from "@/components/priority/ui";
import { Select } from "@/components/ui/Select";

export type EventOption = { id: string; name: string; date: string };

const LEDGER_LABEL: Record<LedgerEntry["status"], { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  pending: { label: "Waiting for Madam Penny", tone: "warning" },
  approved: { label: "Approved — Finance to pay", tone: "info" },
  processing: { label: "Payment processing", tone: "info" },
  paid: { label: "Paid (confirmed)", tone: "success" },
  rejected: { label: "Rejected / withdrawn", tone: "danger" },
};

const METHODS = ["Online banking / bank transfer", "Cheque", "Cash", "Credit card", "Other"];

export function fmtDate(d: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-4">
      <h3 className="mb-2 text-[14px] font-bold text-text">{title}</h3>
      {children}
    </section>
  );
}

/** Runs a server action, shows its error, and refreshes the page data. */
function useRunner() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  async function run(fn: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
      if (done) setMessage(done);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete this action.");
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, message, run, setError };
}

function ConfirmPaymentForm({ entry, companyId, onDone }: { entry: LedgerEntry; companyId: string; onDone: () => void }) {
  const { busy, error, run } = useRunner();
  const [date, setDate] = useState("");
  const [method, setMethod] = useState(METHODS[0]);
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  return (
    <form
      className="mt-2 grid gap-3 rounded-lg border border-border bg-surface-alt p-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          const receipt = file ? (await uploadDocument({ companyId, module: "supplier_payments", fileType: fileTypeFromMime(file), file })).id : undefined;
          await confirmPayment({ paymentId: entry.id, paymentDate: date, paymentMethod: method, referenceNumber: reference, receiptDocumentId: receipt });
          onDone();
        });
      }}
    >
      <p className="text-[13px] text-text-secondary sm:col-span-2">
        Record the payment of <strong className="text-text">{formatPrice(entry.amount)}</strong> only after it has really been made. The system never sends money itself.
      </p>
      <div>
        <label className={LABEL} htmlFor={`pd-${entry.id}`}>Payment date (leave empty for today)</label>
        <input id={`pd-${entry.id}`} type="date" className={FIELD} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div>
        <label className={LABEL} htmlFor={`pm-${entry.id}`}>Payment method</label>
        <Select id={`pm-${entry.id}`} className={FIELD} value={method} onChange={(e) => setMethod(e.target.value)}>
          {METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </Select>
      </div>
      <div>
        <label className={LABEL} htmlFor={`pr-${entry.id}`}>Transaction reference</label>
        <input id={`pr-${entry.id}`} className={FIELD} value={reference} onChange={(e) => setReference(e.target.value)} required />
      </div>
      <div>
        <label className={LABEL} htmlFor={`pf-${entry.id}`}>Proof of payment (optional)</label>
        <input id={`pf-${entry.id}`} type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-[13px] text-text-secondary file:mr-3 file:rounded-md file:border file:border-border-strong file:bg-surface file:px-3 file:py-1.5 file:text-[13px] file:font-semibold" />
      </div>
      <div className="sm:col-span-2"><ErrorLine message={error} /></div>
      <div className="flex justify-end sm:col-span-2">
        <button type="submit" className={BTN} disabled={busy}>{busy ? "Saving..." : "Confirm payment made"}</button>
      </div>
    </form>
  );
}

function LedgerRow({ entry, p, isApprover }: { entry: LedgerEntry; p: PayableView; isApprover: boolean }) {
  const { busy, error, run } = useRunner();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const s = LEDGER_LABEL[entry.status];
  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-[14px] text-text">{formatPrice(entry.amount)}</strong>
          <Pill tone={s.tone}>{s.label}</Pill>
        </div>
        <span className="text-[12.5px] text-text-muted">Requested {formatMalaysiaDateTime(entry.createdAt)}</span>
      </div>
      {entry.status === "paid" && (
        <p className="mt-1 text-[13px] text-text-secondary">
          Paid on {fmtDate(entry.paymentDate)} · ref {entry.referenceNumber}
          {entry.receiptDocumentId && <> · <DocumentViewLink documentId={entry.receiptDocumentId} label="Proof" /></>}
        </p>
      )}
      {entry.decisionNote && <p className="mt-1 text-[13px] text-text-secondary">Note: {entry.decisionNote}</p>}

      {entry.status === "pending" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {isApprover ? (
            <>
              <button type="button" className={BTN_SM} disabled={busy} onClick={() => void run(() => decidePaymentRequest({ paymentId: entry.id, decision: "approved" }))}>Approve</button>
              <button type="button" className={BTN_SM_GHOST} disabled={busy} onClick={() => setRejecting((v) => !v)}>Reject</button>
            </>
          ) : (
            <span className="text-[12.5px] text-text-muted">Only Madam Penny can approve or reject.</span>
          )}
          <button type="button" className={BTN_SM_GHOST} disabled={busy} onClick={() => void run(() => withdrawPaymentRequest(entry.id))}>Withdraw request</button>
        </div>
      )}
      {rejecting && (
        <div className="mt-2 flex flex-col gap-2">
          <textarea className={AREA} rows={2} placeholder="Reason for rejecting" value={note} onChange={(e) => setNote(e.target.value)} />
          <div><button type="button" className={BTN_SM} disabled={busy || !note.trim()} onClick={() => void run(() => decidePaymentRequest({ paymentId: entry.id, decision: "rejected", note }))}>Confirm rejection</button></div>
        </div>
      )}
      {(entry.status === "approved" || entry.status === "processing") && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {entry.status === "approved" && <button type="button" className={BTN_SM_GHOST} disabled={busy} onClick={() => void run(() => startPaymentProcessing(entry.id))}>Start processing</button>}
          <button type="button" className={BTN_SM} onClick={() => setConfirming((v) => !v)}>Record payment made</button>
        </div>
      )}
      {confirming && <ConfirmPaymentForm entry={entry} companyId={p.companyId} onDone={() => setConfirming(false)} />}
      <div className="mt-2"><ErrorLine message={error} /></div>
    </li>
  );
}

function Simple({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3">{children}</div>;
}

export function PayableManager({ p, isApprover, events, onClose }: { p: PayableView; isApprover: boolean; events: EventOption[]; onClose: () => void }) {
  const { busy, error, message, run } = useRunner();
  const [amount, setAmount] = useState(p.requestable > 0 ? p.requestable.toFixed(2) : "");
  const [reqNote, setReqNote] = useState("");
  const [urgentReason, setUrgentReason] = useState(p.control?.urgentReason ?? "");
  const [overrideLevel, setOverrideLevel] = useState<PriorityLevel | "">(p.control?.priorityOverride ?? "");
  const [overrideReason, setOverrideReason] = useState(p.control?.overrideReason ?? "");
  const [hold, setHoldValue] = useState<"" | "on_hold" | "disputed">(p.control?.holdStatus ?? "");
  const [holdReason, setHoldReason] = useState(p.control?.holdReason ?? "");
  const [alertType, setAlertType] = useState<OpsAlertType | "">(p.control?.opsAlertType ?? "");
  const [alertNote, setAlertNote] = useState(p.control?.opsAlertNote ?? "");
  const [alertEvent, setAlertEvent] = useState(p.control?.opsAlertEventId ?? "");
  const [note, setNote] = useState(p.control?.notes ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof getPayableHistory>> | null>(null);
  const ref = { type: p.type, id: p.id };
  const paid = p.statusKey === "paid";

  return (
    <Dialog title={`${p.supplierName}${p.reference ? ` · ${p.reference}` : ""}`} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {p.priority && <Pill tone={PRIORITY_TONE[p.priority]}>{PRIORITY_LABEL[p.priority]}</Pill>}
          <Pill tone={PAYMENT_STATUS_TONE[p.statusKey]}>{PAYMENT_STATUS_LABEL[p.statusKey]}</Pill>
          <Pill tone={APPROVAL_TONE[p.approval]}>{APPROVAL_LABEL[p.approval]}</Pill>
          <span className="text-[13px] text-text-secondary">{p.companyName} · Due {p.dueDate ? fmtDate(p.dueDate) : "Data Required"}</span>
        </div>
        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-surface-alt p-3 text-[13.5px] sm:grid-cols-4">
          <div><dt className="text-text-muted">Invoice amount</dt><dd className="text-[16px] font-bold text-text">{formatPrice(p.amount)}</dd></div>
          <div><dt className="text-text-muted">Paid (confirmed)</dt><dd className="text-[16px] font-bold text-success">{formatPrice(p.paidAmount)}</dd></div>
          <div><dt className="text-text-muted">Outstanding</dt><dd className="text-[16px] font-bold text-text">{formatPrice(p.outstanding)}</dd></div>
          <div><dt className="text-text-muted">Balance</dt><dd className="text-[14px] font-bold">{paid ? "Settled" : p.verification === "verified" ? "Verified" : p.verification === "changed" ? "Amount changed: verify again" : "Pending Verification"}</dd></div>
        </dl>
        <p className="text-[13px] text-text-secondary">Priority: {p.priorityReason}</p>
        <ErrorLine message={error} />
        {message && <div className="rounded-lg border border-success/30 bg-success-bg px-3 py-2 text-[13px] font-medium text-success">{message}</div>}

        {!paid && p.verification !== "verified" && (
          <Section title="1. Verify the outstanding balance">
            <p className="mb-2 text-[13.5px] text-text-secondary">Check the amount against the supplier&apos;s invoice or statement. Until then it is shown as Pending Verification and is not counted as a confirmed balance.</p>
            <button type="button" className={BTN} disabled={busy} onClick={() => void run(() => verifyBalance(ref), "Balance verified.")}>I have checked: {formatPrice(p.amount)} is correct</button>
          </Section>
        )}

        {!paid && (
          <Section title="2. Payment request">
            {p.requestable > 0 ? (
              <form
                className="grid gap-3 sm:grid-cols-[10rem_1fr_auto]"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(() => requestPayment({ ...ref, amount: Number(amount), note: reqNote }), "Payment request sent to Madam Penny.");
                }}
              >
                <div>
                  <label className={LABEL} htmlFor="req-amount">Amount (RM)</label>
                  <input id="req-amount" type="number" step="0.01" min="0.01" max={p.requestable} className={FIELD} value={amount} onChange={(e) => setAmount(e.target.value)} required />
                </div>
                <div>
                  <label className={LABEL} htmlFor="req-note">Note (optional)</label>
                  <input id="req-note" className={FIELD} value={reqNote} onChange={(e) => setReqNote(e.target.value)} />
                </div>
                <div className="flex items-end"><button type="submit" className={BTN} disabled={busy}>Submit request</button></div>
                <p className="text-[12.5px] text-text-muted sm:col-span-3">A part payment is fine: you can request less than the balance and request the rest later. Approval does not mark anything as paid.</p>
              </form>
            ) : (
              <p className="text-[13.5px] text-text-secondary">
                {p.verification !== "verified" ? "Verify the balance first." : p.control?.holdStatus ? "This payable is on hold or disputed." : "The whole outstanding balance is already in a payment request."}
              </p>
            )}
          </Section>
        )}

        {p.ledger.length > 0 && (
          <Section title="Payments and requests">
            <ul className="flex flex-col gap-2">
              {[...p.ledger].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((l) => (
                <LedgerRow key={l.id} entry={l} p={p} isApprover={isApprover} />
              ))}
            </ul>
          </Section>
        )}

        {!paid && (
          <Section title="Priority">
            <Simple>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <input className={FIELD} placeholder="Why is this payment urgent?" value={urgentReason} onChange={(e) => setUrgentReason(e.target.value)} aria-label="Why is this payment urgent?" />
                <div className="flex gap-2">
                  <button type="button" className={BTN_GHOST} disabled={busy || !urgentReason.trim()} onClick={() => void run(() => setUrgent({ ...ref, urgent: true, reason: urgentReason }), "Marked urgent.")}>Mark urgent</button>
                  {p.control?.isUrgent && <button type="button" className={BTN_GHOST} disabled={busy} onClick={() => void run(() => setUrgent({ ...ref, urgent: false }), "Urgent mark removed.")}>Remove</button>}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
                <Select className={FIELD} value={overrideLevel} onChange={(e) => setOverrideLevel(e.target.value as PriorityLevel | "")} aria-label="Priority override">
                  <option value="">Automatic</option>
                  {(["urgent", "high", "medium", "low"] as PriorityLevel[]).map((l) => (
                    <option key={l} value={l}>{PRIORITY_LABEL[l]}</option>
                  ))}
                </Select>
                <input className={FIELD} placeholder="Reason for changing the priority" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} aria-label="Reason for changing the priority" />
                <button type="button" className={BTN_GHOST} disabled={busy || (overrideLevel !== "" && !overrideReason.trim())} onClick={() => void run(() => overridePriority({ ...ref, priority: overrideLevel || null, reason: overrideReason }), "Priority saved.")}>Save priority</button>
              </div>
            </Simple>
          </Section>
        )}

        {!paid && (
          <Section title="Hold or dispute">
            <div className="grid gap-2 sm:grid-cols-[11rem_1fr_auto]">
              <Select className={FIELD} value={hold} onChange={(e) => setHoldValue(e.target.value as "" | "on_hold" | "disputed")} aria-label="Hold status">
                <option value="">Not on hold</option>
                <option value="on_hold">On hold</option>
                <option value="disputed">Disputed</option>
              </Select>
              <input className={FIELD} placeholder="Reason" value={holdReason} onChange={(e) => setHoldReason(e.target.value)} aria-label="Reason for the hold" />
              <button type="button" className={BTN_GHOST} disabled={busy || (hold !== "" && !holdReason.trim())} onClick={() => void run(() => setHold({ ...ref, status: hold || null, reason: holdReason }), "Saved.")}>Save</button>
            </div>
          </Section>
        )}

        {!paid && (
          <Section title="Operational alert (only record what has been confirmed)">
            <div className="grid gap-2">
              <Select className={FIELD} value={alertType} onChange={(e) => setAlertType(e.target.value as OpsAlertType | "")} aria-label="Operational alert">
                <option value="">No operational alert</option>
                {(Object.keys(OPS_ALERT_LABEL) as OpsAlertType[]).map((k) => (
                  <option key={k} value={k}>{OPS_ALERT_LABEL[k]}</option>
                ))}
              </Select>
              {alertType === "event_affected" && (
                <Select className={FIELD} value={alertEvent} onChange={(e) => setAlertEvent(e.target.value)} aria-label="Affected event">
                  <option value="">Which event? (optional)</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>{ev.name} · {fmtDate(ev.date)}</option>
                  ))}
                </Select>
              )}
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <input className={FIELD} placeholder="What was confirmed, by whom and when" value={alertNote} onChange={(e) => setAlertNote(e.target.value)} aria-label="What was confirmed" />
                <button type="button" className={BTN_GHOST} disabled={busy || (alertType !== "" && !alertNote.trim())} onClick={() => void run(() => setOperationalAlert({ ...ref, alertType: alertType || null, note: alertNote, eventId: alertEvent || undefined }), "Saved.")}>Save alert</button>
              </div>
            </div>
          </Section>
        )}

        <Section title="Notes">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <textarea className={AREA} rows={2} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Notes" />
            <div className="flex items-end"><button type="button" className={BTN_GHOST} disabled={busy} onClick={() => void run(() => saveControlNote({ ...ref, note }), "Note saved.")}>Save note</button></div>
          </div>
          {p.remarks && <p className="mt-2 text-[13px] text-text-secondary">Finance remarks: {p.remarks}</p>}
        </Section>

        <Section title="Supporting documents">
          {p.documents.length > 0 ? (
            <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px]">
              {p.documents.map((d) => (
                <li key={d.id}><DocumentViewLink documentId={d.id} label={d.label} /></li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-[13.5px] text-text-secondary">No document attached yet.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input type="file" accept="application/pdf,image/*,.xlsx,.xls,.csv" aria-label="Document to attach" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[13px] text-text-secondary file:mr-3 file:rounded-md file:border file:border-border-strong file:bg-surface file:px-3 file:py-1.5 file:text-[13px] file:font-semibold" />
            <button
              type="button"
              className={BTN_GHOST}
              disabled={busy || !file}
              onClick={() =>
                void run(async () => {
                  if (!file) return;
                  const doc = await uploadDocument({ companyId: p.companyId, module: p.type === "finance_payment" ? "finance_payments" : "supplier_invoices", fileType: fileTypeFromMime(file), file });
                  await attachTaskProof({ companyId: p.companyId, relatedTable: p.type === "finance_payment" ? "finance_payments" : "supplier_invoices", relatedId: p.id, documentId: doc.id, proofType: "supporting_document", revalidatePaths: ["/priority-centre"] });
                  setFile(null);
                }, "Document attached.")
              }
            >
              Attach document
            </button>
          </div>
        </Section>

        <Section title="History">
          {history ? (
            history.length === 0 ? (
              <p className="text-[13.5px] text-text-secondary">No changes recorded yet.</p>
            ) : (
              <ol className="divide-y divide-border">
                {history.map((r) => (
                  <li key={r.id} className="py-2 text-[13px]">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-semibold text-text">{r.action.replace(/_/g, " ")}</span>
                      <span className="text-text-muted">{r.performerName} · {formatMalaysiaDateTime(r.created_at)}</span>
                    </div>
                    {(r.previous_value || r.new_value) && <div className="text-text-secondary">{r.previous_value ? `${r.previous_value} → ` : ""}{r.new_value}</div>}
                    {r.reason && <div className="text-text-secondary">Reason: {r.reason}</div>}
                  </li>
                ))}
              </ol>
            )
          ) : (
            <button type="button" className={BTN_GHOST} disabled={busy} onClick={() => void run(async () => setHistory(await getPayableHistory(p.type, p.id)))}>Show history</button>
          )}
        </Section>
      </div>
    </Dialog>
  );
}
