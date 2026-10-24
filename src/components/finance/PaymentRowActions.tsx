"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { errorMessage } from "@/lib/actionResult";
import { deletePayment, restorePayment, type PaymentUndo } from "@/lib/finance/paymentActions";

const UNDO_KEY = "finance-payment-undo";
const UNDO_EVENT = "finance-payment-undo-changed";
const btn = "rounded-md border border-border-strong bg-white px-2.5 py-1 text-[12px] font-semibold text-text hover:border-primary hover:text-primary disabled:opacity-50";

function remember(undo: PaymentUndo) {
  try {
    sessionStorage.setItem(UNDO_KEY, JSON.stringify(undo));
  } catch {
    /* the banner just does not appear */
  }
  window.dispatchEvent(new Event(UNDO_EVENT));
}

/** Edit and Delete (with Undo) of one payment. `after` is where to go once it is deleted (the detail page goes back to its list). */
export function PaymentRowActions({ id, after, editOnly }: { id: string; after?: string; editOnly?: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(t("Delete this payment? You can undo it right after."))) return;
    setBusy(true);
    setError(null);
    try {
      const r = await deletePayment(id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      remember(r.undo);
      if (after) router.push(after);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not delete the payment. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <Link href={`/finance/payments/${id}/edit`} className={btn}>
          Edit
        </Link>
        {!editOnly && (
          <button type="button" disabled={busy} onClick={() => void remove()} className={`${btn} text-danger`}>
            Delete
          </button>
        )}
      </div>
      {error && <div role="alert" className="text-[12px] text-danger">{error}</div>}
    </div>
  );
}

/** Shown after a payment was deleted: Undo puts the same payment back. */
export function PaymentUndoBanner() {
  const router = useRouter();
  const [undo, setUndo] = useState<PaymentUndo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      try {
        const raw = sessionStorage.getItem(UNDO_KEY);
        setUndo(raw ? (JSON.parse(raw) as PaymentUndo) : null);
      } catch {
        setUndo(null);
      }
    };
    const timer = setTimeout(read, 0);
    window.addEventListener(UNDO_EVENT, read);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(UNDO_EVENT, read);
    };
  }, []);

  if (!undo) return null;

  const dismiss = () => {
    try {
      sessionStorage.removeItem(UNDO_KEY);
    } catch {
      /* nothing stored */
    }
    setUndo(null);
    setError(null);
  };

  async function restore() {
    if (!undo) return;
    setBusy(true);
    setError(null);
    try {
      const result = await restorePayment(undo);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      dismiss();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not undo."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning-bg px-4 py-2.5 text-[13px]">
      <span className="font-semibold text-text">{`Deleted: ${undo.label}`}</span>
      <button type="button" disabled={busy} onClick={restore} className="rounded-lg bg-primary px-3 py-1 text-[12.5px] font-bold text-white disabled:opacity-60">
        {busy ? "Restoring..." : "Undo"}
      </button>
      <button type="button" onClick={dismiss} className="text-[12.5px] font-semibold text-text-secondary hover:underline">
        Dismiss
      </button>
      {error && <span role="alert" className="text-[12px] text-danger">{error}</span>}
    </div>
  );
}
