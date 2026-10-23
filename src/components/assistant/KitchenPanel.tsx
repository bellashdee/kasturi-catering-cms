"use client";

import { useState } from "react";
import type { RecipeRef } from "@/lib/kitchenAi/match";
import type { CalcResult, KItem, KSession, KState } from "@/lib/kitchenAi/types";

export type KitchenPatch = Record<string, unknown> & { kind: string };

type Props = {
  state: KState;
  calc: CalcResult;
  recipeOptions: RecipeRef[];
  busy: boolean;
  onPatch: (patch: KitchenPatch) => void;
  onExport: () => void;
  onExit: () => void;
};

const inputClass = "h-8 rounded-md border border-border-strong bg-white px-2 text-[12.5px] outline-none focus:border-primary";

function ItemRow({ item, recipeOptions, busy, onPatch, pax, hasPax }: { item: KItem; recipeOptions: RecipeRef[]; busy: boolean; onPatch: Props["onPatch"]; pax: number | null; hasPax: boolean }) {
  const [name, setName] = useState(item.name);
  const suggested = item.candidates.filter((c) => recipeOptions.some((r) => r.id === c.recipeId));
  const missing = !item.recipeId && !item.estimate;
  return (
    <div className="rounded-lg border border-border bg-white p-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== item.name && onPatch({ kind: "rename_item", itemId: item.id, name })}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          aria-label="Dish"
          className={`${inputClass} min-w-[9rem] flex-1 font-semibold`}
        />
        <select
          value={item.recipeId ?? ""}
          disabled={busy}
          onChange={(e) => onPatch({ kind: "set_recipe", itemId: item.id, recipeId: e.target.value || null })}
          aria-label="Recipe"
          className={`${inputClass} min-w-[10rem] flex-1 ${missing ? "border-warning text-warning" : ""}`}
        >
          <option value="">{item.estimate ? "AI estimate (no recipe)" : "No recipe — Recipe Data Required"}</option>
          {suggested.length > 0 && (
            <optgroup label="Suggested">
              {suggested.map((c) => (
                <option key={`s${c.recipeId}`} value={c.recipeId}>{c.name}</option>
              ))}
            </optgroup>
          )}
          <optgroup label="All recipes (A–Z)">
            {recipeOptions.map((r) => (
              <option key={r.id} value={r.id} disabled={!r.hasIngredients}>{r.name}{r.hasIngredients ? "" : " (no ingredients yet)"}</option>
            ))}
          </optgroup>
        </select>
        <button type="button" disabled={busy} onClick={() => onPatch({ kind: "remove_item", itemId: item.id })} aria-label="Remove dish" className="h-8 rounded-md px-2 text-[13px] font-bold text-danger hover:bg-danger-bg disabled:opacity-40">
          ✕
        </button>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-text-muted">
        {item.recipeBy === "auto" && item.recipeId && <span>Matched by name — check it is the right recipe.</span>}
        {item.recipeBy === "user" && <span>Recipe chosen by you.</span>}
        {item.note && <span>Note on the menu: {item.note}</span>}
        {item.estimate && (
          <span className={`rounded-full px-2 py-0.5 font-bold ${item.estimate.status === "pending" ? "bg-warning-bg text-warning" : "bg-success-bg text-success"}`}>
            {item.estimate.status === "pending" ? "AI ESTIMATE — NOT YET VERIFIED" : `AI estimate reviewed by ${item.estimate.reviewedBy ?? "a chef"}`}
          </span>
        )}
        {missing && (
          <button
            type="button"
            disabled={busy || !hasPax}
            title={hasPax ? "" : "Enter the pax first"}
            onClick={() => onPatch({ kind: "estimate", itemId: item.id })}
            className="rounded-md border border-primary px-2 py-0.5 font-semibold text-primary disabled:opacity-40"
          >
            AI estimate{pax ? ` for ${pax} pax` : ""}
          </button>
        )}
      </div>
    </div>
  );
}

function SessionBox({ session, recipeOptions, busy, onPatch }: { session: KSession; recipeOptions: RecipeRef[]; busy: boolean; onPatch: Props["onPatch"] }) {
  const [pax, setPax] = useState(session.pax?.toString() ?? "");
  const [newDish, setNewDish] = useState("");
  const commitPax = () => {
    const n = Number(pax);
    if (Number.isFinite(n) && n >= 1 && n !== session.pax) onPatch({ kind: "pax", sessionId: session.id, pax: Math.round(n) });
  };
  return (
    <div className="rounded-xl border border-border bg-surface-alt/50 p-2.5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-extrabold uppercase tracking-wide text-text-secondary">{session.name}</span>
        <label className="ml-auto flex items-center gap-1.5 text-[12px] font-semibold text-text-secondary">
          Pax
          <input
            type="number"
            min={1}
            value={pax}
            onChange={(e) => setPax(e.target.value)}
            onBlur={commitPax}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            placeholder="required"
            className={`${inputClass} w-24 text-right ${session.pax === null ? "border-warning" : ""}`}
          />
        </label>
      </div>
      <div className="flex flex-col gap-1.5">
        {session.items.map((item) => (
          <ItemRow key={`${item.id}:${item.name}`} item={item} recipeOptions={recipeOptions} busy={busy} onPatch={onPatch} pax={session.pax} hasPax={session.pax !== null} />
        ))}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (newDish.trim()) {
            onPatch({ kind: "add_item", sessionId: session.id, name: newDish });
            setNewDish("");
          }
        }}
      >
        <input value={newDish} onChange={(e) => setNewDish(e.target.value)} placeholder="+ Add a dish" aria-label="Add a dish" className={`${inputClass} flex-1`} />
        <button type="submit" disabled={busy || !newDish.trim()} className="h-8 rounded-md border border-border-strong bg-white px-3 text-[12.5px] font-semibold text-text disabled:opacity-40">
          Add
        </button>
      </form>
    </div>
  );
}

/**
 * The menu and pax of the kitchen conversation, editable before anything is calculated: dish names, the recipe each dish uses,
 * pax per session, and the buttons for the results.
 */
export function KitchenPanel({ state, calc, recipeOptions, busy, onPatch: patchOut, onExport, onExit }: Props) {
  const [open, setOpen] = useState(true);
  // asking for a result closes the editor so the answer has the room (it opens again from the header)
  const onPatch: Props["onPatch"] = (p) => {
    if (p.kind === "view" || p.kind === "stock") setOpen(false);
    patchOut(p);
  };
  const pending = calc.usesPendingEstimate;
  const btn = "rounded-lg border border-border-strong bg-white px-3 py-1.5 text-[12.5px] font-semibold text-text hover:border-primary hover:text-primary disabled:opacity-40";
  return (
    <div className="border-b border-border bg-bg px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-[12.5px] font-bold text-text" aria-expanded={open}>
          {open ? "▾" : "▸"} Menu &amp; pax
        </button>
        <span className="truncate text-[12px] text-text-muted">{state.companyName}{state.event ? ` · ${state.event.name}` : state.photoEventName ? ` · ${state.photoEventName}` : ""}</span>
        <button type="button" onClick={onExit} className="ml-auto text-[12px] font-medium text-text-secondary hover:text-text">
          Exit kitchen mode
        </button>
      </div>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {state.mismatches.length > 0 && (
            <div className="rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-[12px] text-warning">
              <div className="font-bold">The photo and the event order do not match (the order was not changed):</div>
              <ul className="ml-4 list-disc">
                {state.mismatches.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          {state.readerIssues.length > 0 && <div className="rounded-lg border border-border bg-white px-3 py-2 text-[12px] text-text-secondary">About the photo: {state.readerIssues.join(" ")}</div>}
          {state.sessions.map((s) => (
            <SessionBox key={s.id} session={s} recipeOptions={recipeOptions} busy={busy} onPatch={onPatch} />
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => onPatch({ kind: "view", view: "ingredients" })} className={btn}>
              Generate Ingredients
            </button>
            <button type="button" disabled={busy} onClick={() => onPatch({ kind: "view", view: "shopping" })} className={btn}>
              Generate Shopping List
            </button>
            <button type="button" disabled={busy} onClick={() => onPatch({ kind: "stock" })} className={btn}>
              Compare with Stock
            </button>
            <button type="button" disabled={busy} onClick={() => onPatch({ kind: "unit_mode", mode: state.unitMode === "kg" ? "auto" : "kg" })} className={btn}>
              {state.unitMode === "kg" ? "Units: kg / litres ✓" : "Show in kg / litres"}
            </button>
            {pending && (
              <button type="button" disabled={busy} onClick={() => onPatch({ kind: "approve" })} className={`${btn} border-warning text-warning`}>
                Mark AI estimates reviewed
              </button>
            )}
            <button type="button" disabled={busy || calc.combined.length === 0} onClick={onExport} className="rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-40">
              Export to Excel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
