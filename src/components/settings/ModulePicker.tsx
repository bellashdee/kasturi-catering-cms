"use client";

import { ASSIGNABLE_MODULES } from "@/lib/modules";
import { MODULE_SECTIONS } from "@/lib/sections";

/**
 * What a member can open, as the side menu is laid out: each module, and under it the sub-categories (the tabs) of that module.
 * Modules: every module (null), or only the ticked ones. Sub-categories: all of a module's tabs, or only the ticked ones.
 * `sections` holds the keys of the ticked sub-categories of the modules that are limited (a module with no key is open in full).
 */
export function ModulePicker({
  value,
  onChange,
  sections,
  onSectionsChange,
}: {
  value: string[] | null;
  onChange: (next: string[] | null) => void;
  sections: string[] | null;
  onSectionsChange: (next: string[] | null) => void;
}) {
  const restricted = value !== null;
  const chosenKeys = sections ?? [];

  /** The sub-categories of a module the member has now (all of them when the module is not limited). */
  const selectedOf = (moduleKey: string): string[] => {
    const all = MODULE_SECTIONS[moduleKey].map((s) => s.key);
    const mine = chosenKeys.filter((k) => k.startsWith(`${moduleKey}:`));
    return mine.length === 0 ? all : mine;
  };
  const setModuleSections = (moduleKey: string, next: string[]) => {
    const all = MODULE_SECTIONS[moduleKey].map((s) => s.key);
    const others = chosenKeys.filter((k) => !k.startsWith(`${moduleKey}:`));
    // every sub-category ticked = no limit for this module (no key is kept)
    const merged = next.length === all.length ? others : [...others, ...next];
    onSectionsChange(merged.length === 0 ? null : merged);
  };
  const toggleSection = (moduleKey: string, key: string) => {
    const current = selectedOf(moduleKey);
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    if (next.length === 0) return; // a module needs at least one sub-category; untick the module itself instead
    setModuleSections(moduleKey, next);
  };
  const toggleModule = (moduleKey: string, on: boolean) => {
    onChange(on ? [...(value ?? []), moduleKey] : (value ?? []).filter((k) => k !== moduleKey));
    if (!on) {
      const rest = chosenKeys.filter((k) => !k.startsWith(`${moduleKey}:`));
      onSectionsChange(rest.length === 0 ? null : rest);
    }
  };

  return (
    <div className="mt-2 rounded-lg border border-border bg-surface p-3">
      <div className="text-[11px] font-semibold text-text-secondary">Modules and sub-categories this member can view and edit</div>
      <div className="mt-1.5 flex gap-4 text-[12.5px] text-text">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={!restricted} onChange={() => onChange(null)} /> All modules
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={restricted} onChange={() => onChange(value ?? [])} /> Only selected modules
        </label>
      </div>

      <ul className="mt-2 flex flex-col gap-1.5">
        {ASSIGNABLE_MODULES.map((m) => {
          const enabled = !restricted || value!.includes(m.key);
          const subs = MODULE_SECTIONS[m.key];
          const picked = subs ? selectedOf(m.key) : [];
          return (
            <li key={m.key} className="rounded-md border border-border px-2.5 py-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {restricted ? (
                  <label className="flex items-center gap-1.5 text-[13px] font-semibold text-text">
                    <input type="checkbox" checked={enabled} onChange={(e) => toggleModule(m.key, e.target.checked)} />
                    {m.label}
                  </label>
                ) : (
                  <span className="text-[13px] font-semibold text-text">{m.label}</span>
                )}
                {subs && enabled && <span className="text-[11.5px] text-text-muted">{picked.length === subs.length ? `All ${subs.length} sub-categories` : `${picked.length} of ${subs.length} sub-categories`}</span>}
              </div>
              {subs && enabled && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-[11.5px] font-semibold text-primary">Choose the sub-categories</summary>
                  <div className="mt-1.5 flex flex-wrap gap-2 text-[11.5px]">
                    <button type="button" onClick={() => setModuleSections(m.key, subs.map((s) => s.key))} className="rounded border border-border-strong px-2 py-0.5 font-semibold text-text">
                      Select all
                    </button>
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                    {subs.map((s) => (
                      <label key={s.key} className="flex items-center gap-1.5 text-[12.5px] text-text">
                        <input type="checkbox" checked={picked.includes(s.key)} onChange={() => toggleSection(m.key, s.key)} />
                        {s.label}
                      </label>
                    ))}
                  </div>
                </details>
              )}
            </li>
          );
        })}
      </ul>

      {restricted && <p className="mt-2 text-[11.5px] text-text-muted">Other modules are hidden from the menu, blocked if opened by link, and their data is protected in the database.</p>}
      <p className="mt-1 text-[11.5px] text-text-muted">A sub-category that is not ticked is hidden from the tabs and blocked if opened by link. My Profile, Main Dashboard, Priority Centre, Bulletin Board, Company Spending and the AI Assistant are in the menu of everyone.</p>
    </div>
  );
}
