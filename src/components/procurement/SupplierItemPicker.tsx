"use client";

import { useMemo, useRef, useState } from "react";
import { formatPrice } from "@/lib/format";
import type { SupplierItemOption } from "@/lib/purchasePlanner/shared";

const inputClass = "h-9 w-full rounded-lg border border-border-strong bg-white px-2 text-[13px] outline-none focus:border-primary";
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

/** Searchable pick of a supplier item: the ingredient's likely matches first, or type to search every item of every supplier. */
export function SupplierItemPicker({ ingredient, selected, suggestions, all, onPick }: { ingredient: string; selected: SupplierItemOption | null; suggestions: SupplierItemOption[]; all: SupplierItemOption[]; onPick: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const list = useMemo(() => {
    const words = norm(typed).split(" ").filter(Boolean);
    if (words.length === 0) return suggestions;
    return all.filter((o) => words.every((w) => norm(`${o.description} ${o.supplierName}`).includes(w))).slice(0, 60);
  }, [typed, suggestions, all]);

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className={`${inputClass} flex items-center justify-between gap-2 text-left`} aria-label={`Supplier item for ${ingredient}`}>
        <span className="truncate">{selected ? `${selected.description} · ${selected.supplierName}` : <span className="text-text-muted">Search and choose the supplier item</span>}</span>
        <span aria-hidden="true" className="text-text-muted">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-[26rem] max-w-[90vw] rounded-lg border border-border-strong bg-surface p-2 shadow-lg" onBlur={() => { closeTimer.current = setTimeout(() => setOpen(false), 150); }} onFocus={() => { if (closeTimer.current) clearTimeout(closeTimer.current); }}>
          <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search item or supplier..." className={inputClass} />
          <ul className="mt-1.5 max-h-64 overflow-y-auto">
            {list.length === 0 && <li className="px-2 py-2 text-[12.5px] text-text-muted">No supplier item found.</li>}
            {list.map((o) => (
              <li
                key={o.key}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(o.key);
                  setOpen(false);
                  setTyped("");
                }}
                className={`cursor-pointer rounded-md px-2 py-1.5 hover:bg-info-bg ${selected?.key === o.key ? "bg-info-bg" : ""}`}
              >
                <div className="text-[13px] font-semibold text-text">{o.description}</div>
                <div className="text-[11.5px] text-text-muted">{`${o.supplierName} · ${o.uom || "unit"} · ${formatPrice(o.price)}`}</div>
              </li>
            ))}
          </ul>
          {typed === "" && <div className="mt-1 px-1 text-[11px] text-text-muted">{suggestions.length > 0 ? "Likely matches. Type to search all items." : "No likely match. Type to search all items."}</div>}
        </div>
      )}
    </div>
  );
}
