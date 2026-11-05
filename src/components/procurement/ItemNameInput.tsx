"use client";

import { useId, useMemo, useRef, useState } from "react";
import { matchSuggestions, type ItemSuggestion } from "@/lib/procurement/itemSuggestions";


const SOURCE_LABEL: Record<ItemSuggestion["source"], string> = {
  previous: "Ordered before",
  stock: "Stock item",
  menu: "Menu ingredient",
  invoice: "Invoice item",
};

/**
 * An item name box that lists matching items as the person types (items ordered before, stock items, menu ingredients).
 * Typing a name that is not listed is always allowed; picking a listed one can also fill in its last price.
 */
export function ItemNameInput({
  value,
  onChange,
  onPick,
  suggestions,
  supplierId,
  placeholder = "Item name",
}: {
  value: string;
  onChange: (value: string) => void;
  onPick: (suggestion: ItemSuggestion) => void;
  suggestions: ItemSuggestion[];
  supplierId: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const matches = useMemo(() => matchSuggestions(suggestions, value, supplierId), [suggestions, value, supplierId]);
  const showList = open && matches.length > 0;

  function pick(s: ItemSuggestion) {
    onPick(s);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => {
          if (closeTimer.current) clearTimeout(closeTimer.current);
          setOpen(true);
        }}
        onBlur={() => {
          // a short delay so a click on a suggestion is not lost
          closeTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(matches[active] ?? matches[0]);
          } else if (e.key === "Tab" && !e.shiftKey && value.trim() !== "") {
            // a short key: type a few letters (or the item code) and press Tab to complete the item, then go on to the next box
            const first = matches[active] ?? matches[0];
            const typed = value.trim().toUpperCase();
            if (first && (first.name.toUpperCase().startsWith(typed) || (first.code ?? "").toUpperCase() === typed || matches.length === 1)) pick(first);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        className="h-9 w-full rounded-lg border border-border-strong px-2 text-[13px]"
      />
      {showList && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-10 z-20 max-h-64 overflow-y-auto rounded-lg border border-border-strong bg-surface shadow-lg">
          {matches.map((s, i) => (
            <li
              key={`${s.source}-${s.code ?? ""}-${s.name}-${s.supplierId ?? ""}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 ${i === active ? "bg-info-bg" : ""}`}
            >
              <div className="text-[13px] font-semibold text-text">{s.code && <span className="mr-1.5 rounded bg-surface-alt px-1.5 py-0.5 text-[11px] font-bold text-text-secondary">{s.code}</span>}{s.name}</div>
              <div className="text-[11px] text-text-muted">
                {SOURCE_LABEL[s.source]}
                {s.lastPrice !== undefined && ` · last RM ${s.lastPrice.toFixed(2)}`}
                {s.supplierName && ` · ${s.supplierName}`}
                {s.lastOrderDate && ` · ${s.lastOrderDate}`}
                {s.unit && s.source !== "previous" && ` · ${s.unit}`}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
