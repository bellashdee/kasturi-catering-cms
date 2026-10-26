"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { decidePaymentRequest } from "@/lib/priority/paymentActions";
import { setTaskStatus } from "@/lib/priority/taskActions";
import { markAllNotificationsRead, markNotificationRead, saveReminderSettings } from "@/lib/priority/notificationActions";
import { REMINDER_DAY_CHOICES } from "@/lib/priority/reminders";
import { formatPrice } from "@/lib/format";
import { AREA, BTN, BTN_SM, BTN_SM_GHOST, ErrorLine, Pill } from "@/components/priority/ui";

export type ApprovalItem = {
  paymentId: string;
  supplierName: string;
  companyName: string;
  amount: number;
  reference: string | null;
  requestedAt: string;
  waitingDays: number;
  note: string | null;
  /** The outstanding balance of the payable and whether it is verified, so the decision is made with the facts in front of Madam Penny. */
  outstanding: number;
  verified: boolean;
  dueDate: string | null;
};

function useRunner() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      if (result && typeof result === "object" && "ok" in result && result.ok === false) {
        setError("error" in result && typeof result.error === "string" ? result.error : "Could not complete this action.");
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete this action.");
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

function ApprovalRow({ a, canDecide }: { a: ApprovalItem; canDecide: boolean }) {
  const { busy, error, run } = useRunner();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <li className="rounded-lg border border-border p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-bold text-text">{a.supplierName}</div>
          <div className="text-[13px] text-text-secondary">
            {a.companyName}
            {a.reference ? ` · ${a.reference}` : ""}
            {a.dueDate ? ` · due ${a.dueDate.split("-").reverse().join("/")}` : ""}
          </div>
          {a.note && <div className="mt-1 text-[13px] text-text-secondary">Note: {a.note}</div>}
          <div className="mt-1 text-[12.5px] text-text-muted">
            Requested {a.waitingDays === 0 ? "today" : `${a.waitingDays} day(s) ago`} · balance of the invoice {formatPrice(a.outstanding)} {a.verified ? "(verified)" : "(not verified)"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[20px] font-extrabold tabular-nums text-text">{formatPrice(a.amount)}</div>
          {canDecide ? (
            <div className="mt-2 flex justify-end gap-1.5">
              <button type="button" className={BTN_SM} disabled={busy} onClick={() => void run(() => decidePaymentRequest({ paymentId: a.paymentId, decision: "approved" }))}>Approve</button>
              <button type="button" className={BTN_SM_GHOST} disabled={busy} onClick={() => setRejecting((v) => !v)}>Reject</button>
            </div>
          ) : (
            <Pill tone="warning">Waiting for Madam Penny</Pill>
          )}
        </div>
      </div>
      {rejecting && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea className={AREA} rows={2} placeholder="Reason for rejecting" aria-label="Reason for rejecting" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div><button type="button" className={BTN_SM} disabled={busy || !reason.trim()} onClick={() => void run(() => decidePaymentRequest({ paymentId: a.paymentId, decision: "rejected", note: reason }))}>Confirm rejection</button></div>
        </div>
      )}
      <div className="mt-2"><ErrorLine message={error} /></div>
      <p className="mt-2 text-[12px] text-text-muted">Approving only releases the request to Finance. The invoice is marked paid only after Finance records the real payment.</p>
    </li>
  );
}

export function ApprovalList({ items, canDecide }: { items: ApprovalItem[]; canDecide: boolean }) {
  if (items.length === 0) return <p className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center text-[14px] text-text-secondary">No payment requests are waiting for approval.</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((a) => (
        <ApprovalRow key={a.paymentId} a={a} canDecide={canDecide} />
      ))}
    </ul>
  );
}

/** The "Mark as completed" tick used in the daily briefing. */
export function BriefingTaskCheck({ id, title }: { id: string; title: string }) {
  const { busy, error, run } = useRunner();
  return (
    <span className="inline-flex flex-col">
      <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold text-text-secondary">
        <input type="checkbox" disabled={busy} onChange={() => void run(() => setTaskStatus(id, "completed"))} aria-label={`Mark as completed: ${title}`} className="h-4 w-4 accent-[var(--color-success)]" />
        Mark as completed
      </label>
      {error && <span className="text-[12px] text-danger">{error}</span>}
    </span>
  );
}

export type NotificationItem = { id: string; severity: "danger" | "warning" | "info"; title: string; body: string | null; href: string | null; createdAt: string };

export function NotificationList({ items }: { items: NotificationItem[] }) {
  const { busy, error, run } = useRunner();
  if (items.length === 0) return <p className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center text-[14px] text-text-secondary">No unread reminders.</p>;
  const TONE = { danger: "danger", warning: "warning", info: "info" } as const;
  const LABEL = { danger: "Urgent", warning: "Soon", info: "Notice" } as const;
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button type="button" className={BTN_SM_GHOST} disabled={busy} onClick={() => void run(() => markAllNotificationsRead())}>Mark all as read</button>
      </div>
      <ErrorLine message={error} />
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {items.map((n) => (
          <li key={n.id} className="flex flex-wrap items-start justify-between gap-3 px-3.5 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={TONE[n.severity]}>{LABEL[n.severity]}</Pill>
                {n.href ? <Link href={n.href} className="text-[14px] font-semibold text-text hover:underline">{n.title}</Link> : <span className="text-[14px] font-semibold text-text">{n.title}</span>}
              </div>
              {n.body && <div className="mt-0.5 text-[13px] text-text-secondary">{n.body}</div>}
            </div>
            <button type="button" className={BTN_SM_GHOST} disabled={busy} onClick={() => void run(() => markNotificationRead(n.id))}>Mark as read</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const DAY_LABEL: Record<number, string> = { 14: "14 days before", 7: "7 days before", 3: "3 days before", 1: "1 day before", 0: "On the due date" };

export function ReminderSettingsForm({ daysBefore, remindAfterDeadline }: { daysBefore: number[]; remindAfterDeadline: boolean }) {
  const { busy, error, run } = useRunner();
  const [days, setDays] = useState<number[]>(daysBefore);
  const [after, setAfter] = useState(remindAfterDeadline);
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await saveReminderSettings({ daysBefore: days, remindAfterDeadline: after });
          setSaved(true);
        });
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[13px] font-semibold text-text-secondary">Remind me for payments, events and tasks:</legend>
        {REMINDER_DAY_CHOICES.map((d) => (
          <label key={d} className="flex cursor-pointer items-center gap-2 text-[14px] text-text">
            <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={days.includes(d)} onChange={(e) => { setSaved(false); setDays(e.target.checked ? [...days, d] : days.filter((x) => x !== d)); }} />
            {DAY_LABEL[d]}
          </label>
        ))}
        <label className="flex cursor-pointer items-center gap-2 text-[14px] text-text">
          <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={after} onChange={(e) => { setSaved(false); setAfter(e.target.checked); }} />
          Every week after the deadline while it is still unresolved
        </label>
      </fieldset>
      <ErrorLine message={error} />
      <div className="flex items-center gap-3">
        <button type="submit" className={BTN} disabled={busy}>{busy ? "Saving..." : "Save reminder timing"}</button>
        {saved && <span className="text-[13px] font-semibold text-success">Saved</span>}
      </div>
      <p className="text-[12.5px] text-text-muted">Each item is reminded once per timing, never twice. Reminders appear in the bell at the top and in this page. E-mail, WhatsApp and push messages are not switched on, because no such service has been set up.</p>
    </form>
  );
}
