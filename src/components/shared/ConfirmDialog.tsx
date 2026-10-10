"use client";

import { useEffect, useRef } from "react";

/**
 * Modal confirmation for sensitive actions. Uses the native <dialog> element, so Escape closes it,
 * focus is trapped inside, and screen readers announce it as a dialog.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      aria-labelledby="confirm-dialog-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-surface p-0 text-text shadow-xl backdrop:bg-black/40"
    >
      <div className="p-5">
        <h2 id="confirm-dialog-title" className="text-[16px] font-bold text-text">
          {title}
        </h2>
        <div className="mt-3 text-[13.5px] text-text-secondary">{children}</div>
        {error && (
          <div role="alert" className="mt-3 rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger">
            {error}
          </div>
        )}
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-[13.5px] font-semibold text-text disabled:opacity-60"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`rounded-lg px-4 py-2 text-[13.5px] font-semibold text-white disabled:opacity-60 ${danger ? "bg-danger" : "bg-primary"}`}
        >
          {busy ? "Working..." : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
