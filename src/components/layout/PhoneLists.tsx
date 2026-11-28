"use client";

import { useEffect } from "react";
import "./phone.css";

// phones (portrait and landscape) and tablets: the lists and tables become cards up to 1023 px (phone.css)
const PHONE = "(max-width: 1023px)";
/** a grid of 4 or more fixed columns, e.g. grid-cols-[1.2fr_1fr_1fr_1fr] */
const FIXED_GRID = /grid-cols-\[[^\]]*_[^\]]*_[^\]]*_[^\]]*\]/;

const clean = (t: string | null) => (t ?? "").replace(/[▲▼↑↓⇅↕]/g, "").replace(/\s+/g, " ").trim();

function setIfChanged(el: Element, name: string, value: string) {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

/** Tables: every cell gets the name of its column (from the header row), so that a row can be shown as a card on a phone. */
function labelTables(main: Element) {
  main.querySelectorAll<HTMLTableElement>("table").forEach((table) => {
    // a table you type in keeps its columns (it scrolls sideways inside its own box)
    if (table.closest("[data-no-cards]") || table.querySelector("tbody input, tbody select, tbody textarea")) return;
    const headRow = table.tHead?.rows[0];
    if (!headRow) return;
    const heads = Array.from(headRow.cells);
    if (heads.length < 3 || heads.some((h) => h.colSpan > 1)) return;
    const labels = heads.map((h) => clean(h.textContent));
    setIfChanged(table, "data-cards", "");
    const rows = [...Array.from(table.tBodies).flatMap((b) => Array.from(b.rows)), ...Array.from(table.tFoot?.rows ?? [])];
    for (const tr of rows) {
      const cells = Array.from(tr.cells);
      if (cells.length !== labels.length || cells.some((c) => c.colSpan > 1)) {
        setIfChanged(tr, "data-span", "");
        continue;
      }
      cells.forEach((c, i) => setIfChanged(c, "data-label", labels[i]));
    }
  });
}

/** Lists made of fixed columns (a header row of grid columns, then one row per record): the same, with the names from the header row. */
function labelLists(main: Element) {
  const parents = new Set<Element>();
  main.querySelectorAll<HTMLElement>('[class*="grid-cols-["]').forEach((el) => {
    if (typeof el.className === "string" && FIXED_GRID.test(el.className) && el.parentElement) parents.add(el.parentElement);
  });
  parents.forEach((parent) => {
    let labels: string[] | null = null;
    let token = "";
    for (const child of Array.from(parent.children)) {
      if (!(child instanceof HTMLElement)) continue;
      const grid = FIXED_GRID.exec(child.className)?.[0];
      // a header row: the same grid as the rows, written in capitals
      if (grid && child.className.includes("uppercase")) {
        labels = Array.from(child.children).map((c) => clean(c.textContent));
        token = grid;
        setIfChanged(child, "data-phone-head", "");
        continue;
      }
      if (!labels) continue;
      // a row is the grid itself, or a grid inside a box of its own (a row with its buttons under it, as on Catering Events)
      const rows = grid
        ? [child]
        : Array.from(child.children).filter((c): c is HTMLElement => c instanceof HTMLElement && FIXED_GRID.exec(c.className)?.[0] === token);
      for (const row of rows) {
        if (FIXED_GRID.exec(row.className)?.[0] !== token || row.children.length !== labels.length) continue;
        setIfChanged(row, "data-phone-row", "");
        Array.from(row.children).forEach((c, i) => setIfChanged(c, "data-label", labels![i]));
      }
    }
  });
}

/**
 * Phone layout helper: names the columns of tables and fixed-column lists (see phone.css, which turns each row into a card on a phone).
 * It only reads the page and sets small data- marks; it works again whenever the page changes (a filter, a new row).
 */
export function PhoneLists() {
  useEffect(() => {
    const mq = window.matchMedia(PHONE);
    const main = document.querySelector("main");
    let frame = 0;
    const run = () => {
      frame = 0;
      if (!mq.matches || !main) return;
      labelTables(main);
      labelLists(main);
    };
    // a timer, not an animation frame: a page opened in the background (another tab, the phone's app switched away) gets no frames, and
    // one frame asked for and never given kept the lists from ever becoming cards on that page
    const schedule = () => {
      if (!frame) frame = window.setTimeout(run, 30);
    };
    const observer = new MutationObserver(schedule);
    if (main) observer.observe(main, { childList: true, subtree: true });
    mq.addEventListener("change", schedule);
    schedule();
    return () => {
      observer.disconnect();
      mq.removeEventListener("change", schedule);
      if (frame) window.clearTimeout(frame);
    };
  }, []);
  return null;
}
