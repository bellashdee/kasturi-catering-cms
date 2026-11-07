"use client";

import { useState } from "react";

/** A block that stays hidden until its button is pressed (and can be hidden again). */
export function ToggleSection({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="h-9 rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-text hover:bg-surface-alt"
        >
          {open ? "Hide" : "Show"} {label}
        </button>
      </div>
      {open && children}
    </div>
  );
}
