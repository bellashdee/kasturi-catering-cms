"use client";

import { useEffect, useRef } from "react";

/** A status pill: the colour is never the only clue, the text label is always shown. */
export function Pill({ tone, children }: { tone: "success" | "warning" | "danger" | "info" | "neutral"; children: React.ReactNode }) {
  const TONE: Record<string, string> = {
    success: "bg-success-bg text-success",
    warning: "bg-warning-bg text-warning",
    danger: "bg-danger-bg text-danger",
    info: "bg-info-bg text-primary",
    neutral: "bg-[#eef0f3] text-text-secondary",
  };
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold ${TONE[tone]}`}>{children}</span>;
}

export const FIELD = "h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-[14px] text-text outline-none focus:border-primary";
export const AREA = "w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[14px] text-text outline-none focus:border-primary";
export const LABEL = "mb-1 block text-[12.5px] font-semibold text-text-secondary";
export const BTN = "inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-[14px] font-semibold text-white hover:bg-primary-hover disabled:opacity-50";
export const BTN_GHOST = "inline-flex h-10 items-center justify-center rounded-lg border border-border-strong bg-surface px-4 text-[14px] font-semibold text-text hover:bg-bg disabled:opacity-50";
export const BTN_SM = "inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-[12.5px] font-semibold text-white hover:bg-primary-hover disabled:opacity-50";
export const BTN_SM_GHOST = "inline-flex h-8 items-center justify-center rounded-md border border-border-strong bg-surface px-3 text-[12.5px] font-semibold text-text hover:bg-bg disabled:opacity-50";

/** A centred dialog with a dimmed background; Escape or a click outside closes it. */
export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-3 sm:p-8" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`w-full ${wide ? "max-w-3xl" : "max-w-xl"} rounded-xl border border-border bg-surface shadow-xl outline-none`}>
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <h2 className="text-[16px] font-bold text-text">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-md text-[20px] leading-none text-text-secondary hover:bg-bg">
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] font-medium text-danger">
      {message}
    </div>
  );
}
