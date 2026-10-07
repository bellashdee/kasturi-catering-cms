"use client";

import { ASSIGNABLE_MODULES } from "@/lib/modules";

/** Which modules a member can open: every module (null), or only the ticked ones. */
export function ModulePicker({ value, onChange }: { value: string[] | null; onChange: (next: string[] | null) => void }) {
  const restricted = value !== null;
  return (
    <div className="mt-2 rounded-lg border border-border bg-surface p-3">
      <div className="text-[11px] font-semibold text-text-secondary">Modules this member can view and edit</div>
      <div className="mt-1.5 flex gap-4 text-[12.5px] text-text">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={!restricted} onChange={() => onChange(null)} /> All modules
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={restricted} onChange={() => onChange(value ?? [])} /> Only selected modules
        </label>
      </div>
      {restricted && (
        <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-1.5">
          {ASSIGNABLE_MODULES.map((m) => (
            <label key={m.key} className="flex items-center gap-1.5 text-[12.5px] text-text">
              <input
                type="checkbox"
                checked={value!.includes(m.key)}
                onChange={(e) => onChange(e.target.checked ? [...value!, m.key] : value!.filter((k) => k !== m.key))}
              />
              {m.label}
            </label>
          ))}
        </div>
      )}
      {restricted && <p className="mt-2 text-[11.5px] text-text-muted">Other modules are hidden from the menu, blocked if opened by link, and their data is protected in the database.</p>}
    </div>
  );
}
