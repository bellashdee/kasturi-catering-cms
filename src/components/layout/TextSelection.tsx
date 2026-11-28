"use client";

import { useEffect } from "react";

const FIELDS = "input, textarea, select, [contenteditable='true']";

/**
 * Text on every page can be selected with the mouse and copied, also inside a row that is a link (most lists): dragging over a link
 * selects its text instead of dragging the link away (see globals.css), and letting go after selecting does not open the record.
 * A plain click still opens it as before.
 */
export function TextSelection() {
  useEffect(() => {
    let start: { x: number; y: number } | null = null;

    function down(e: MouseEvent) {
      start = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
      // Firefox drags a link unless it is told not to (Chrome and Safari use the CSS rule)
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (link instanceof HTMLAnchorElement && link.draggable) link.draggable = false;
    }

    function click(e: MouseEvent) {
      const from = start;
      start = null;
      if (!from || e.button !== 0) return;
      const target = e.target as Element | null;
      if (!target || target.closest?.(FIELDS)) return;
      const moved = Math.abs(e.clientX - from.x) + Math.abs(e.clientY - from.y) > 4;
      const selection = window.getSelection();
      const selected = !!selection && !selection.isCollapsed && selection.toString().trim().length > 0;
      // the mouse was dragged to select text: keep the selection, do not open the link / row
      if (moved && selected) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    document.addEventListener("mousedown", down, true);
    document.addEventListener("click", click, true);
    return () => {
      document.removeEventListener("mousedown", down, true);
      document.removeEventListener("click", click, true);
    };
  }, []);
  return null;
}
