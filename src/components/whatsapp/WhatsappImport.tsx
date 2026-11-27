"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { analyseWhatsappMessage, discardWhatsappImport, saveWhatsappDraft, submitWhatsappImport, type SubmitResult } from "@/lib/whatsapp/actions";
import { checkResult, completion, malayDay, weekdayMatches, type CheckItem } from "@/lib/whatsapp/checks";
import {
  emptyDate,
  emptySession,
  sessionPax,
  SNACK_UNITS,
  WA_CATEGORY_LABEL,
  type PaxLine,
  type SnackItem,
  type WaCategory,
  type WaDate,
  type WaMatch,
  type WaQuotationDay,
  type WaResult,
  type WaSession,
} from "@/lib/whatsapp/types";
import { EVENT_TYPE_OPTIONS, MEAL_TYPE_KEYS, MEAL_TYPE_LABEL, SERVICE_TYPE_LABEL } from "@/lib/catering/constants";
import { TimeInput12 } from "@/components/ui/TimeInput12";
import { Select } from "@/components/ui/Select";

const input = "mt-1 h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-[14px] outline-none focus:border-primary";
const area = "mt-1 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[14px] outline-none focus:border-primary";
const label = "text-[12.5px] font-semibold text-text-secondary";
const card = "rounded-xl border border-border bg-surface p-4 shadow-sm";
const h2 = "text-[15px] font-extrabold text-text";
const smallBtn = "h-8 rounded-lg border border-border-strong bg-surface px-2.5 text-[12.5px] font-semibold text-text hover:bg-surface-alt";

const LEVEL_STYLE: Record<CheckItem["level"], string> = {
  ok: "border-success/40 bg-success-bg text-success",
  missing: "border-danger/40 bg-danger-bg text-danger",
  verify: "border-yellow-500 bg-yellow-50 text-yellow-900",
};
const LEVEL_MARK: Record<CheckItem["level"], string> = { ok: "✓", missing: "✗", verify: "!" };

export type RecentImport = { id: string; importedAt: string; by: string; category: WaCategory; status: string; preview: string; link: string | null };

/** A field that shows Pending / Not Provided in red while it is empty. */
function Missing({ show, text = "Pending" }: { show: boolean; text?: string }) {
  if (!show) return null;
  return <span className="ml-1.5 rounded bg-danger-bg px-1.5 py-0.5 text-[11px] font-bold text-danger">{text}</span>;
}

function DateField({ value, onChange, title }: { value: WaDate; onChange: (v: WaDate) => void; title: string }) {
  const wd = weekdayMatches(value);
  return (
    <div>
      <label className={label}>
        {title} <Missing show={!value.date} text="Not Provided" />
      </label>
      <div className="flex items-center gap-2">
        <input type="date" value={value.date} onChange={(e) => onChange({ ...value, date: e.target.value, yearStated: true })} className={input} />
        <span className="mt-1 whitespace-nowrap text-[13px] font-semibold text-text-secondary">{malayDay(value.date)}</span>
      </div>
      {value.text && <div className="mt-0.5 text-[11.5px] text-text-muted">{`In the message: "${value.text}"`}</div>}
      {value.date && !value.yearStated && <div className="mt-1 rounded bg-yellow-50 px-2 py-1 text-[12px] font-semibold text-yellow-900">! The year is not in the message: {value.date.slice(0, 4)} was filled in. Check it (changing the date clears this).</div>}
      {wd === false && <div className="mt-1 rounded bg-yellow-50 px-2 py-1 text-[12px] font-semibold text-yellow-900">{`! The message says "${value.weekdayStated}", but this date is a ${malayDay(value.date)}. Check with the Boss: the date was not changed.`}</div>}
    </div>
  );
}

function Breakdown({ lines, onChange }: { lines: PaxLine[]; onChange: (l: PaxLine[]) => void }) {
  const total = lines.reduce((t, l) => t + (l.pax && l.pax > 0 ? l.pax : 0), 0);
  return (
    <div className="mt-2 rounded-lg border border-border bg-surface-alt p-2.5">
      <div className="mb-1 flex items-center justify-between text-[12.5px] font-bold text-text">
        <span>Pax breakdown (as written by the Boss)</span>
        <span>{`Total: ${total} pax`}</span>
      </div>
      {lines.length === 0 && <div className="text-[12.5px] text-text-muted">No group / department written. Add one if needed.</div>}
      <div className="flex flex-col gap-1.5">
        {lines.map((l, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input value={l.category} onChange={(e) => onChange(lines.map((x, n) => (n === i ? { ...x, category: e.target.value } : x)))} className={`${input} !mt-0 flex-1`} placeholder="Group / department" aria-label="Group" />
            <input
              type="number"
              min={1}
              value={l.pax ?? ""}
              onChange={(e) => onChange(lines.map((x, n) => (n === i ? { ...x, pax: e.target.value ? Number(e.target.value) : null } : x)))}
              className={`${input} !mt-0 w-24 ${l.pax ? "" : "border-danger"}`}
              placeholder="Pending"
              aria-label="Pax"
            />
            <button type="button" onClick={() => onChange(lines.filter((_, n) => n !== i))} className="px-1.5 text-[13px] font-bold text-text-muted hover:text-danger" aria-label="Remove">
              ✕
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...lines, { category: "", pax: null }])} className={`${smallBtn} mt-2`}>
        + Add group
      </button>
    </div>
  );
}

function SessionCard({ s, n, onChange, onRemove }: { s: WaSession; n: number; onChange: (v: WaSession) => void; onRemove?: () => void }) {
  const set = <K extends keyof WaSession>(k: K, v: WaSession[K]) => onChange({ ...s, [k]: v });
  const pax = sessionPax(s);
  return (
    <div className="rounded-xl border-l-[4px] border-primary bg-surface p-3 shadow-sm ring-1 ring-border">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[14px] font-extrabold text-text">{`Meal session ${n + 1}${s.name ? ` — ${s.name}` : ""}`}</div>
        <div className="flex items-center gap-2 text-[13px] font-bold text-text">
          {pax ? `${pax} pax` : <Missing show text="Pax pending" />}
          {onRemove && (
            <button type="button" onClick={onRemove} className="text-[12px] font-semibold text-danger hover:underline">
              Remove session
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={label}>Session name</label>
          <input value={s.name} onChange={(e) => set("name", e.target.value)} className={input} placeholder="e.g. Packfood / VIP – Halftime" />
        </div>
        <div>
          <label className={label}>
            Service type <Missing show={!s.serviceType} />
          </label>
          <Select value={s.serviceType} onChange={(e) => set("serviceType", e.target.value)} className={input}>
            <option value="">Pending</option>
            {Object.entries(SERVICE_TYPE_LABEL).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className={label}>Meal time</label>
          <TimeInput12 value={s.mealTime} onChange={(v) => set("mealTime", v)} fieldClass={input} className="!mt-1" ariaLabel="Meal time" />
        </div>
      </div>
      <div className="mt-2">
        <label className={label}>
          Meal type <Missing show={s.mealTypes.length === 0} />
        </label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {MEAL_TYPE_KEYS.map((k) => {
            const on = s.mealTypes.includes(k);
            return (
              <button key={k} type="button" onClick={() => set("mealTypes", on ? s.mealTypes.filter((m) => m !== k) : [...s.mealTypes, k])} className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${on ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text"}`}>
                {MEAL_TYPE_LABEL[k]}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-2">
        <label className={label}>
          Menu <Missing show={!s.menu.trim()} />
        </label>
        <textarea value={s.menu} onChange={(e) => set("menu", e.target.value)} className={`${area} h-20`} placeholder="Pending (not in the message)" />
      </div>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <Breakdown lines={s.breakdown} onChange={(l) => set("breakdown", l)} />
        <div className="sm:w-44">
          <label className={label}>Total pax written</label>
          <input type="number" min={1} value={s.paxStated ?? ""} onChange={(e) => set("paxStated", e.target.value ? Number(e.target.value) : null)} className={input} placeholder="—" />
          <div className="mt-1 text-[11.5px] text-text-muted">Only when the Boss wrote a total without a breakdown.</div>
        </div>
      </div>
      <div className="mt-3 rounded-lg bg-surface-alt p-2.5">
        <div className="text-[12.5px] font-bold text-text">Delivery</div>
        <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={label}>Delivery date</label>
            <input type="date" value={s.deliveryDate} onChange={(e) => set("deliveryDate", e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>
              Delivery time <Missing show={!s.deliveryTime} text="Not Provided" />
            </label>
            <TimeInput12 value={s.deliveryTime} onChange={(v) => set("deliveryTime", v)} fieldClass={input} className="!mt-1" ariaLabel="Delivery time" />
          </div>
          <div>
            <label className={label}>Delivery location</label>
            <input value={s.deliveryLocation} onChange={(e) => set("deliveryLocation", e.target.value)} className={input} placeholder="Not Provided" />
          </div>
          <div className="sm:col-span-3">
            <label className={label}>Delivery instructions</label>
            <input value={s.deliveryInstructions} onChange={(e) => set("deliveryInstructions", e.target.value)} className={input} />
          </div>
        </div>
      </div>
      <div className="mt-2">
        <label className={label}>Special instructions (this session)</label>
        <input value={s.specialInstructions} onChange={(e) => set("specialInstructions", e.target.value)} className={input} />
      </div>
    </div>
  );
}

function QuotationForm({ r, set }: { r: WaResult; set: (r: WaResult) => void }) {
  const q = r.quotation;
  const setQ = <K extends keyof typeof q>(k: K, v: (typeof q)[K]) => set({ ...r, quotation: { ...q, [k]: v } });
  const setDay = (i: number, d: WaQuotationDay) => setQ("days", q.days.map((x, n) => (n === i ? d : x)));
  return (
    <div className="flex flex-col gap-4">
      <section className={card}>
        <h2 className={h2}>Company &amp; Event Details</h2>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={label}>Company</label>
            <input value="Signature Solution Sdn Bhd" disabled className={`${input} bg-surface-alt font-semibold`} />
          </div>
          <div>
            <label className={label}>Customer</label>
            <input value={q.customerName} onChange={(e) => setQ("customerName", e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Event category</label>
            <Select value={q.eventType} onChange={(e) => setQ("eventType", e.target.value)} className={input}>
              {EVENT_TYPE_OPTIONS.map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <label className={label}>
              Event name <Missing show={!q.eventName.trim()} />
            </label>
            <input value={q.eventName} onChange={(e) => setQ("eventName", e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Budget</label>
            <input value={q.budget} onChange={(e) => setQ("budget", e.target.value)} className={input} placeholder="Not Provided" />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Match details (if any)</label>
            <input value={q.matchDetails} onChange={(e) => setQ("matchDetails", e.target.value)} className={input} placeholder="e.g. JDT III vs ..." />
          </div>
          <div>
            <label className={label}>Kick-off time</label>
            <TimeInput12 value={q.kickOff} onChange={(v) => setQ("kickOff", v)} fieldClass={input} className="!mt-1" ariaLabel="Kick-off" />
          </div>
          <div>
            <label className={label}>Event time</label>
            <TimeInput12 value={q.eventTime} onChange={(v) => setQ("eventTime", v)} fieldClass={input} className="!mt-1" ariaLabel="Event time" />
          </div>
        </div>
      </section>

      <section className={card}>
        <h2 className={h2}>Event Date &amp; Venue</h2>
        <div className="mt-2">
          <label className={label}>
            Venue / location <Missing show={!q.venue.trim()} text="Not Provided" />
          </label>
          <input value={q.venue} onChange={(e) => setQ("venue", e.target.value)} className={input} placeholder="Not Provided" />
        </div>
      </section>

      {q.days.map((d, i) => (
        <section key={i} className={`${card} flex flex-col gap-3`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className={h2}>{q.days.length > 1 ? `Day ${i + 1}: Pax Breakdown & Meal Details` : "Pax Breakdown & Meal Details"}</h2>
            {q.days.length > 1 && (
              <button type="button" onClick={() => setQ("days", q.days.filter((_, n) => n !== i))} className="text-[12.5px] font-semibold text-danger hover:underline">
                Remove this day
              </button>
            )}
          </div>
          <div className="max-w-sm">
            <DateField value={d} onChange={(v) => setDay(i, { ...d, ...v })} title={q.days.length > 1 ? `Date of day ${i + 1}` : "Event date"} />
          </div>
          {d.sessions.map((s, n) => (
            <SessionCard
              key={n}
              s={s}
              n={n}
              onChange={(v) => setDay(i, { ...d, sessions: d.sessions.map((x, m) => (m === n ? v : x)) })}
              onRemove={d.sessions.length > 1 ? () => setDay(i, { ...d, sessions: d.sessions.filter((_, m) => m !== n) }) : undefined}
            />
          ))}
          <button type="button" onClick={() => setDay(i, { ...d, sessions: [...d.sessions, emptySession()] })} className={`${smallBtn} self-start`}>
            + Add meal session
          </button>
        </section>
      ))}
      <button type="button" onClick={() => setQ("days", [...q.days, { ...emptyDate(), sessions: [emptySession()] }])} className={`${smallBtn} self-start`}>
        + Add another day
      </button>

      <section className={card}>
        <h2 className={h2}>Special Instructions</h2>
        <textarea value={q.specialInstructions} onChange={(e) => setQ("specialInstructions", e.target.value)} className={`${area} h-20`} />
      </section>
    </div>
  );
}

function MatchesForm({ r, set }: { r: WaResult; set: (r: WaResult) => void }) {
  const setM = (i: number, m: WaMatch) => set({ ...r, matches: r.matches.map((x, n) => (n === i ? m : x)) });
  const blank = (): WaMatch => ({ ...emptyDate(), matchDetails: "", competition: "", homeAway: "home", venue: "", kickOff: "", remarks: "" });
  return (
    <section className={`${card} flex flex-col gap-3`}>
      <div>
        <h2 className={h2}>JDT Match Schedule (date only)</h2>
        <p className="text-[12.5px] text-text-secondary">Each match becomes a date-only event (Date Confirmed) on the Event Calendar. Menu and pax are added later on the same event.</p>
      </div>
      {r.matches.length === 0 && <div className="text-[13px] text-text-muted">No match found. Add one below.</div>}
      {r.matches.map((m, i) => (
        <div key={i} className={`rounded-xl border-l-[4px] p-3 ring-1 ring-border ${m.homeAway === "away" ? "border-border-strong bg-surface-alt" : "border-blue-600 bg-blue-50"}`}>
          <div className="flex items-center justify-between">
            <div className="text-[14px] font-extrabold text-text">{`Match ${i + 1}`}</div>
            <button type="button" onClick={() => set({ ...r, matches: r.matches.filter((_, n) => n !== i) })} className="text-[12px] font-semibold text-danger hover:underline">
              Remove
            </button>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <DateField value={m} onChange={(v) => setM(i, { ...m, ...v })} title="Match date" />
            <div className="sm:col-span-2">
              <label className={label}>Match details</label>
              <input value={m.matchDetails} onChange={(e) => setM(i, { ...m, matchDetails: e.target.value })} className={input} placeholder="e.g. JDT FC vs KL CITY FC" />
            </div>
            <div>
              <label className={label}>Competition</label>
              <input value={m.competition} onChange={(e) => setM(i, { ...m, competition: e.target.value })} className={input} />
            </div>
            <div>
              <label className={label}>Home / away</label>
              <Select value={m.homeAway} onChange={(e) => setM(i, { ...m, homeAway: e.target.value })} className={input}>
                <option value="home">Home (catering may be needed)</option>
                <option value="away">Away (information only, no catering)</option>
                <option value="">Not stated</option>
              </Select>
            </div>
            <div>
              <label className={label}>
                Kick-off <Missing show={!m.kickOff} text="Not Provided" />
              </label>
              <TimeInput12 value={m.kickOff} onChange={(v) => setM(i, { ...m, kickOff: v })} fieldClass={input} className="!mt-1" ariaLabel="Kick-off" />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>
                Venue <Missing show={!m.venue.trim()} text="Not Provided" />
              </label>
              <input value={m.venue} onChange={(e) => setM(i, { ...m, venue: e.target.value })} className={input} />
            </div>
            <div>
              <label className={label}>Remarks</label>
              <input value={m.remarks} onChange={(e) => setM(i, { ...m, remarks: e.target.value })} className={input} />
            </div>
          </div>
          <label className="mt-2 flex items-center gap-2 text-[12.5px] text-text-secondary">
            <input type="checkbox" checked={!!m.saveAnyway} onChange={(e) => setM(i, { ...m, saveAnyway: e.target.checked })} />
            Save even if a JDT event is already on this date (a second, different match). Otherwise that date is skipped so nothing is saved twice.
          </label>
        </div>
      ))}
      <button type="button" onClick={() => set({ ...r, matches: [...r.matches, blank()] })} className={`${smallBtn} self-start`}>
        + Add match
      </button>
    </section>
  );
}

function SnackForm({ r, set }: { r: WaResult; set: (r: WaResult) => void }) {
  const s = r.snack;
  const setS = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => set({ ...r, snack: { ...s, [k]: v } });
  const setItem = (i: number, it: SnackItem) => setS("items", s.items.map((x, n) => (n === i ? it : x)));
  return (
    <div className="flex flex-col gap-4">
      <section className={card}>
        <h2 className={h2}>JDT Training Snack / Refreshment Request</h2>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={label}>Company</label>
            <input value="Signature Solution Sdn Bhd" disabled className={`${input} bg-surface-alt font-semibold`} />
          </div>
          <div>
            <label className={label}>Team</label>
            <input value={s.team} onChange={(e) => setS("team", e.target.value)} className={input} />
          </div>
          <DateField value={s} onChange={(v) => set({ ...r, snack: { ...s, ...v } })} title="Training date" />
          <div>
            <label className={label}>Delivery time</label>
            <TimeInput12 value={s.deliveryTime} onChange={(v) => setS("deliveryTime", v)} fieldClass={input} className="!mt-1" ariaLabel="Delivery time" />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Delivery location</label>
            <input value={s.deliveryLocation} onChange={(e) => setS("deliveryLocation", e.target.value)} className={input} placeholder="Not Provided" />
          </div>
        </div>
      </section>
      <section className={card}>
        <div className="flex items-center justify-between">
          <h2 className={h2}>Items</h2>
          <span className="text-[12.5px] text-text-secondary">{`${s.items.length} item(s)`}</span>
        </div>
        <div className="mt-2 flex flex-col gap-2">
          {s.items.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_5.5rem_6.5rem_auto] items-start gap-1.5 sm:grid-cols-[1.4fr_6rem_7rem_1.4fr_auto]">
              <input value={it.name} onChange={(e) => setItem(i, { ...it, name: e.target.value })} className={`${input} !mt-0`} placeholder="Item" aria-label="Item" />
              <input type="number" min={0} step="any" value={it.quantity ?? ""} onChange={(e) => setItem(i, { ...it, quantity: e.target.value ? Number(e.target.value) : null })} className={`${input} !mt-0 ${it.quantity ? "" : "border-danger"}`} placeholder="Pending" aria-label="Quantity" />
              <input list="snack-units" value={it.unit} onChange={(e) => setItem(i, { ...it, unit: e.target.value })} className={`${input} !mt-0`} placeholder="Unit" aria-label="Unit" />
              <input value={it.remarks} onChange={(e) => setItem(i, { ...it, remarks: e.target.value })} className={`${input} !mt-0 col-span-3 sm:col-span-1`} placeholder="Remarks (e.g. individual packaging)" aria-label="Remarks" />
              <button type="button" onClick={() => setS("items", s.items.filter((_, n) => n !== i))} className="row-start-1 px-1.5 pt-2 text-[13px] font-bold text-text-muted hover:text-danger sm:row-start-auto" style={{ gridColumn: "4 / 5" }} aria-label="Remove">
                ✕
              </button>
            </div>
          ))}
          <datalist id="snack-units">
            {SNACK_UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>
        <button type="button" onClick={() => setS("items", [...s.items, { name: "", quantity: null, unit: "", remarks: "" }])} className={`${smallBtn} mt-2`}>
          + Add item
        </button>
        <div className="mt-3">
          <label className={label}>Remarks</label>
          <textarea value={s.remarks} onChange={(e) => setS("remarks", e.target.value)} className={`${area} h-16`} />
        </div>
      </section>
    </div>
  );
}

function Summary({ r, checks }: { r: WaResult; checks: CheckItem[] }) {
  const pct = completion(checks);
  const counts = { ok: checks.filter((c) => c.level === "ok").length, missing: checks.filter((c) => c.level === "missing").length, verify: checks.filter((c) => c.level === "verify").length };
  let facts: [string, string][] = [];
  if (r.category === "quotation") {
    const sessions = r.quotation.days.flatMap((d) => d.sessions);
    const known = sessions.map(sessionPax);
    const total = known.reduce<number>((t, p) => t + (p ?? 0), 0);
    facts = [
      ["Total pax", known.some((p) => p === null) ? `${total} + Pending` : String(total)],
      ["Meal sessions", String(sessions.length)],
      ["Event date", r.quotation.days.map((d) => d.date || "Pending").join(", ")],
      ["Event status", "New quotation request"],
    ];
  } else if (r.category === "jdt_match") {
    facts = [
      ["Matches", String(r.matches.length)],
      ["Dates", r.matches.map((m) => m.date || "Pending").join(", ") || "—"],
      ["Event status", "Date Confirmed (menu & pax pending)"],
    ];
  } else {
    facts = [
      ["Items", String(r.snack.items.length)],
      ["Training date", r.snack.date || "Pending"],
      ["Status", "New Request"],
    ];
  }
  return (
    <div className={`${card} flex flex-col gap-3`}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {facts.map(([k, v]) => (
          <div key={k} className="rounded-lg bg-surface-alt px-3 py-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{k}</div>
            <div className="text-[14px] font-extrabold text-text">{v}</div>
          </div>
        ))}
      </div>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] font-semibold">
          <span className="text-text">{`Information completion: ${pct}%`}</span>
          <span className="flex gap-2">
            <span className="rounded-full border border-success/40 bg-success-bg px-2 py-0.5 text-success">{`✓ Complete ${counts.ok}`}</span>
            <span className="rounded-full border border-danger/40 bg-danger-bg px-2 py-0.5 text-danger">{`✗ Missing ${counts.missing}`}</span>
            <span className="rounded-full border border-yellow-500 bg-yellow-50 px-2 py-0.5 text-yellow-900">{`! Check ${counts.verify}`}</span>
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-alt">
          <div className={`h-full ${counts.verify > 0 ? "bg-yellow-500" : pct === 100 ? "bg-success" : "bg-primary"}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

function Checklist({ checks }: { checks: CheckItem[] }) {
  const order: CheckItem["level"][] = ["verify", "missing", "ok"];
  const sorted = [...checks].sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
  return (
    <section className={card}>
      <h2 className={h2}>Missing Information Checklist</h2>
      <p className="text-[12.5px] text-text-secondary">Red: not in the message (stays Pending / Not Provided). Yellow: needs the Admin to check. Green: complete.</p>
      <ul className="mt-2 flex flex-col gap-1">
        {sorted.map((c, i) => (
          <li key={i} className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[12.5px] ${LEVEL_STYLE[c.level]}`}>
            <span className="font-extrabold">{LEVEL_MARK[c.level]}</span>
            <span>
              <b>{c.label}</b>
              {c.detail ? ` — ${c.detail}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function WhatsappImport({
  initialImportId,
  initialMessage,
  initialResult,
  recent,
  query,
}: {
  initialImportId: string | null;
  initialMessage: string;
  initialResult: WaResult | null;
  recent: RecentImport[];
  query: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState(initialMessage);
  const [importId, setImportId] = useState<string | null>(initialImportId);
  const [result, setResult] = useState<WaResult | null>(initialResult);
  const [aiCategory, setAiCategory] = useState<WaCategory | null>(initialResult?.category ?? null);
  const [busy, setBusy] = useState<null | "analyse" | "draft" | "submit" | "discard">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState<SubmitResult | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const checks = useMemo(() => (result ? checkResult(result) : []), [result]);

  async function analyse(category?: WaCategory) {
    setBusy("analyse");
    setError(null);
    setNotice(null);
    const r = await analyseWhatsappMessage(message, { importId: importId ?? undefined, category });
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setImportId(r.importId);
    setResult(r.result);
    if (!category) setAiCategory(r.result.category);
    setNotice("Read. Check every section below, fix anything, then Submit (or Save as Draft).");
  }

  function clearAll() {
    if (result && !window.confirm("Clear the message and the form? (A saved draft stays in the list below.)")) return;
    setMessage("");
    setResult(null);
    setImportId(null);
    setAiCategory(null);
    setError(null);
    setNotice(null);
    setDone(null);
    router.replace(`/catering/quotation-requests/whatsapp${query}`);
  }

  async function saveDraft() {
    if (!importId || !result) return;
    setBusy("draft");
    setError(null);
    const r = await saveWhatsappDraft(importId, result);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setNotice("Saved as a draft. You can come back to it from the list below.");
    router.refresh();
  }

  async function submit() {
    if (!importId || !result) return;
    const verify = checks.filter((c) => c.level === "verify").length;
    if (verify > 0 && !window.confirm(`${verify} item(s) still need checking (yellow). Submit anyway?`)) return;
    setBusy("submit");
    setError(null);
    const r = await submitWhatsappImport(importId, result);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setDone(r);
    router.refresh();
  }

  async function discard() {
    if (!importId || !window.confirm("Set this draft aside? It is kept in the list (not deleted).")) return;
    setBusy("discard");
    const r = await discardWhatsappImport(importId);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    clearAll();
    router.refresh();
  }

  const switchCategory = (c: WaCategory) => {
    if (!result) return;
    setResult({ ...result, category: c });
  };

  if (done) {
    return (
      <div className={`${card} border-success/40 bg-success-bg`}>
        <div className="text-[16px] font-extrabold text-success">Submitted ✓</div>
        <div className="mt-2 flex flex-col gap-1.5 text-[14px] text-text">
          {done.requestId && (
            <div>
              {"The quotation request is in the "}
              <Link href={`/catering/quotation-requests/${done.requestId}${query}`} className="font-bold text-primary hover:underline">
                Quotation Request Inbox
              </Link>
              {" (with the original WhatsApp message)."}
              {done.linkedEventId && (
                <>
                  {" It is linked to the JDT date already on the calendar: "}
                  <Link href={`/catering/${done.linkedEventId}${query}`} className="font-bold text-primary hover:underline">
                    open the event
                  </Link>
                  {" — no second event was made."}
                </>
              )}
            </div>
          )}
          {done.eventIds && <div>{`${done.eventIds.length} JDT match date(s) added to the Event Calendar as Date Confirmed.`}</div>}
          {done.skipped && done.skipped.length > 0 && <div className="font-semibold text-yellow-900">{`Skipped (already on the calendar): ${done.skipped.join("; ")}`}</div>}
          {done.eventIds && (
            <Link href={`/catering/calendar${query}`} className="font-bold text-primary hover:underline">
              Open the Event Calendar →
            </Link>
          )}
          {done.snackRequestId && (
            <Link href={`/supplier-procurement/jdt-snacks/${done.snackRequestId}${query}`} className="font-bold text-primary hover:underline">
              Open the snack request (Purchasing) →
            </Link>
          )}
        </div>
        <button type="button" onClick={clearAll} className="mt-3 h-10 rounded-lg bg-primary px-4 text-[14px] font-semibold text-white">
          Import another message
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={h2}>Import from WhatsApp Message</h2>
          <span className="rounded-full bg-surface-alt px-2.5 py-1 text-[12px] font-bold text-text">Company: Signature Solution Sdn Bhd (locked)</span>
        </div>
        <label className={`${label} mt-2 block`}>Paste the WhatsApp event instruction from Boss here.</label>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} className={`${area} h-48 font-mono text-[13px]`} placeholder={"e.g.\nJDT III\nPackfood:\nMarshal: 20\nMedic: 10\nTime: 6:00 PM\nPENGHANTARAN PADA JAM 4.00 PTG"} />
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" disabled={busy !== null || !message.trim()} onClick={() => void analyse()} className="h-10 rounded-lg bg-primary px-4 text-[14px] font-semibold text-white disabled:opacity-50">
            {busy === "analyse" ? "Analysing... (up to a minute)" : "Analyse Message"}
          </button>
          <button type="button" disabled={busy !== null} onClick={clearAll} className="h-10 rounded-lg border border-border-strong bg-surface px-4 text-[14px] font-semibold text-text">
            Clear Message
          </button>
        </div>
        <p className="mt-1.5 text-[12px] text-text-muted">The AI never makes up a menu, pax, quantity, date or price: anything not in the message stays Pending / Not Provided. Nothing is saved to the inbox, calendar or purchasing until you press Submit.</p>
      </section>

      {error && <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13.5px] font-semibold text-danger">{error}</div>}
      {notice && <div className="rounded-lg border border-success/30 bg-success-bg px-3 py-2 text-[13.5px] font-semibold text-success">{notice}</div>}

      {result && (
        <>
          <section className={card}>
            <h2 className={h2}>Type of request</h2>
            {aiCategory && <p className="text-[12.5px] text-text-secondary">{`AI chose: ${WA_CATEGORY_LABEL[aiCategory]}${result.reason ? ` — ${result.reason}` : ""}`}</p>}
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(Object.keys(WA_CATEGORY_LABEL) as WaCategory[]).map((c) => (
                <button key={c} type="button" onClick={() => switchCategory(c)} className={`rounded-xl border-2 px-3 py-2.5 text-left text-[13.5px] font-bold ${result.category === c ? "border-primary bg-primary/10 text-text" : "border-border bg-surface text-text-secondary hover:border-border-strong"}`}>
                  {WA_CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>
            {aiCategory && result.category !== aiCategory && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-text-secondary">
                You changed the type. Read the message again as this type to fill the form:
                <button type="button" disabled={busy !== null} onClick={() => void analyse(result.category)} className={smallBtn}>
                  {busy === "analyse" ? "Analysing..." : `Analyse as ${WA_CATEGORY_LABEL[result.category].slice(3)}`}
                </button>
              </div>
            )}
            <button type="button" onClick={() => setShowOriginal((v) => !v)} className="mt-2 text-[12.5px] font-semibold text-primary hover:underline">
              {showOriginal ? "Hide the original message" : "Show the original message"}
            </button>
            {showOriginal && <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-alt p-3 text-[12.5px] text-text">{message}</pre>}
          </section>

          <Summary r={result} checks={checks} />

          {result.category === "quotation" && <QuotationForm r={result} set={setResult} />}
          {result.category === "jdt_match" && <MatchesForm r={result} set={setResult} />}
          {result.category === "snack" && <SnackForm r={result} set={setResult} />}

          <Checklist checks={checks} />

          <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap gap-2 rounded-xl border border-border bg-surface/95 p-3 shadow-lg backdrop-blur">
            <button type="button" disabled={busy !== null} onClick={() => void submit()} className="h-11 rounded-lg bg-primary px-5 text-[14px] font-bold text-white disabled:opacity-50">
              {busy === "submit" ? "Submitting..." : result.category === "quotation" ? "Submit quotation request" : result.category === "jdt_match" ? "Submit match dates" : "Submit snack request"}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => void saveDraft()} className="h-11 rounded-lg border border-border-strong bg-surface px-4 text-[14px] font-semibold text-text">
              {busy === "draft" ? "Saving..." : "Save as Draft"}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => void discard()} className="h-11 rounded-lg px-3 text-[13px] font-semibold text-text-secondary hover:text-danger">
              Set aside
            </button>
          </div>
        </>
      )}

      {!result && (
        <section className={card}>
          <h2 className={h2}>Or fill in by hand</h2>
          <p className="text-[12.5px] text-text-secondary">Paste a message and press Analyse Message first: the message is kept with whatever you submit.</p>
        </section>
      )}

      <section className={card}>
        <h2 className={h2}>Recent WhatsApp imports</h2>
        {recent.length === 0 ? (
          <div className="mt-1 text-[13px] text-text-muted">None yet.</div>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-text">
                    {WA_CATEGORY_LABEL[r.category]} · <span className={r.status === "draft" ? "text-yellow-800" : r.status === "submitted" ? "text-success" : "text-text-muted"}>{r.status === "draft" ? "Draft" : r.status === "submitted" ? "Submitted" : "Set aside"}</span>
                  </div>
                  <div className="truncate text-[12px] text-text-muted">{`${r.importedAt} · by ${r.by} · "${r.preview}"`}</div>
                </div>
                <div className="flex gap-2">
                  <Link href={`/catering/quotation-requests/whatsapp?id=${r.id}${query ? `&${query.slice(1)}` : ""}`} className={smallBtn + " inline-flex items-center"}>
                    {r.status === "draft" ? "Continue" : "View message"}
                  </Link>
                  {r.link && (
                    <Link href={r.link} className={smallBtn + " inline-flex items-center"}>
                      Open
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
