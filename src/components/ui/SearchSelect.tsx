"use client";

import { useId, useMemo, useRef, useState } from "react";

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();
const MAX_SHOWN = 80;

/**
 * One value, chosen from a list or typed: click the box or the arrow to see the list (A to Z), type to search first, pick one to fill
 * the box. Something that is not in the list can be typed as it is. `onPick` is told when an item was chosen from the list.
 */
export function SearchSelect({
  value,
  onChange,
  options,
  onPick,
  placeholder,
  className,
  required,
  id,
  name,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  onPick?: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  id?: string;
  name?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sorted = useMemo(() => Array.from(new Set(options.filter((o) => o.trim()))).sort((a, b) => a.localeCompare(b)), [options]);
  const matches = useMemo(() => {
    const words = norm(value).split(" ").filter(Boolean);
    return sorted.filter((o) => words.every((w) => norm(o).includes(w))).slice(0, MAX_SHOWN);
  }, [sorted, value]);
  const showList = open && matches.length > 0;

  function pick(item: string) {
    onChange(item);
    onPick?.(item);
    setOpen(false);
    setActive(-1);
  }

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        required={required}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => {
          if (closeTimer.current) clearTimeout(closeTimer.current);
          setOpen(true);
        }}
        onBlur={() => {
          closeTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) setOpen(true);
            else setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (e.key === "ArrowUp" && showList) {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && showList) {
            // Enter picks the highlighted item; with nothing highlighted it keeps what was typed
            e.preventDefault();
            if (active >= 0 && matches[active]) pick(matches[active]);
            else setOpen(false);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        className={`${className ?? ""} pr-9`}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Show the list"
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
        className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:text-text"
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {showList && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border-strong bg-surface shadow-lg">
          {matches.map((o, i) => (
            <li
              key={o}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-1.5 text-[13px] font-semibold text-text pointer-coarse:min-h-12 pointer-coarse:border-b pointer-coarse:border-border pointer-coarse:py-3 pointer-coarse:text-[15px] ${i === active ? "bg-info-bg" : ""}`}
            >
              {o}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
