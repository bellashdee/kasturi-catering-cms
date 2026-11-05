"use client";

import { useEffect, useRef } from "react";

export type FormShortcuts = {
  /** Ctrl+S or Ctrl+Enter */
  save: () => void;
  /** Insert or Alt+N: a new item row */
  addRow: () => void;
  /** Ctrl+Delete: the row the cursor is in */
  removeRow: (index: number) => void;
};

/** The row (data-row="n") the focus is in, or -1. */
function currentRow(): number {
  const el = document.activeElement as HTMLElement | null;
  const row = el?.closest<HTMLElement>("[data-row]");
  return row ? Number(row.dataset.row) : -1;
}

/** Focus the first box of a row once React has drawn it. */
export function focusRow(container: HTMLElement | null, index: number) {
  window.setTimeout(() => {
    const rows = container?.querySelectorAll<HTMLElement>("[data-row]");
    const first = rows?.[index]?.querySelector<HTMLInputElement>("input");
    first?.focus();
    first?.select?.();
  }, 30);
}

/**
 * Keyboard shortcuts for a form with item rows, like an accounting system's entry screen:
 * Ctrl+S / Ctrl+Enter save, Insert / Alt+N add a row, Ctrl+Delete remove the current row.
 */
export function useFormShortcuts(shortcuts: FormShortcuts, container: React.RefObject<HTMLElement | null>, rowCount: number) {
  const latest = useRef(shortcuts);
  latest.current = shortcuts;
  const count = useRef(rowCount);
  count.current = rowCount;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "s" || e.key === "S" || e.key === "Enter")) {
        e.preventDefault();
        latest.current.save();
      } else if (e.key === "Insert" || (e.altKey && (e.key === "n" || e.key === "N"))) {
        e.preventDefault();
        latest.current.addRow();
        focusRow(container.current, count.current);
      } else if (mod && e.key === "Delete") {
        const row = currentRow();
        if (row >= 0 && count.current > 1) {
          e.preventDefault();
          latest.current.removeRow(row);
          focusRow(container.current, Math.max(0, row - 1));
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [container]);
}

/**
 * Enter moves to the next box of the item grid (instead of sending the form); on the last box of the last row it starts a new row.
 * Put on the grid's onKeyDown. A box that handled Enter itself (the item list picking an item) is left alone.
 */
export function gridEnterKey(e: React.KeyboardEvent<HTMLElement>, container: HTMLElement | null, addRow: () => void, rowCount: number) {
  const target = e.target as HTMLElement;
  if (e.key !== "Enter" || e.defaultPrevented || !(target instanceof HTMLInputElement) || !container) return;
  const inputs = [...container.querySelectorAll<HTMLInputElement>("[data-row] input")];
  const at = inputs.indexOf(target);
  if (at < 0) return;
  e.preventDefault();
  const next = inputs[at + 1];
  if (next) {
    next.focus();
    next.select?.();
  } else {
    addRow();
    focusRow(container, rowCount);
  }
}
