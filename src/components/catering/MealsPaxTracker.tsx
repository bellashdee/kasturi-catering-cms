"use client";

import { useMemo, useState, useTransition } from "react";
import * as XLSX from "xlsx";
import { deleteMealsPaxDay, saveMealsPaxDay } from "@/app/(dashboard)/catering/meals-pax/actions";

export type PaxRow = { site: string; date: string; breakfast: number | null; lunch: number | null; dinner: number | null; hitea: number | null; remarks: string | null };

type Cell = { breakfast: string; lunch: string; dinner: string; hitea: string; remarks: string };
type Status = "saving" | "saved" | string; // any other string is an error message

const MEALS = [
  { key: "breakfast", label: "Breakfast Pax" },
  { key: "lunch", label: "Lunch Pax" },
  { key: "dinner", label: "Dinner Pax" },
  { key: "hitea", label: "Hi-tea Pax" },
] as const;

/**
 * The price per pax of each site (Signature Solution): JDT 3, JDT 4 and UTM are charged per meal (breakfast RM10, lunch RM15, dinner RM15);
 * JDT 2 is one price for every meal (RM25). Hi-tea has no price, so it is not charged.
 */
type Prices = { breakfast: number; lunch: number; dinner: number };
const SITE_PRICES: Record<string, Prices> = {
  "JDT 2": { breakfast: 25, lunch: 25, dinner: 25 },
  "JDT 3": { breakfast: 10, lunch: 15, dinner: 15 },
  "JDT 4": { breakfast: 10, lunch: 15, dinner: 15 },
  UTM: { breakfast: 10, lunch: 15, dinner: 15 },
};
const siteKey = (site: string) => site.toUpperCase().replace(/\s+/g, " ").trim();
const pricesOf = (site: string): Prices | null => SITE_PRICES[siteKey(site)] ?? SITE_PRICES[Object.keys(SITE_PRICES).find((k) => siteKey(k) === siteKey(site)) ?? ""] ?? null;
const priceNote = (p: Prices | null) => (!p ? "No price set" : p.breakfast === p.lunch && p.lunch === p.dinner ? `RM${p.breakfast} per meal` : `B RM${p.breakfast} · L RM${p.lunch} · D RM${p.dinner}`);
const rm = (n: number) => `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const num = (s: string) => (s.trim() === "" ? null : Number(s));
const fmt = (n: number) => n.toLocaleString("en-GB");

function daysOfMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * Monthly Meals & Pax record of the Signature Solution sites (JDT 2, JDT 3, JDT 4, UTM): the number of people fed at breakfast,
 * lunch, dinner and hi-tea every day. Typing in a box and leaving it saves that day. The Summary tab adds up every site; the
 * Excel download has the same Summary + one sheet per site layout as the monthly tracker file.
 */
export function MealsPaxTracker({ companyId, companyName, month, monthLabel, sites, initialRows }: { companyId: string; companyName: string; month: string; monthLabel: string; sites: string[]; initialRows: PaxRow[] }) {
  const days = useMemo(() => daysOfMonth(month), [month]);
  const [cells, setCells] = useState<Record<string, Cell>>(() => {
    const m: Record<string, Cell> = {};
    for (const r of initialRows) m[`${r.site}|${r.date}`] = { breakfast: r.breakfast?.toString() ?? "", lunch: r.lunch?.toString() ?? "", dinner: r.dinner?.toString() ?? "", hitea: r.hitea?.toString() ?? "", remarks: r.remarks ?? "" };
    return m;
  });
  const [saved, setSaved] = useState<Record<string, Cell>>(cells);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [tab, setTab] = useState<string>("Summary");
  const [editing, setEditing] = useState<string | null>(null); // "site|date" of the day being edited
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const empty: Cell = { breakfast: "", lunch: "", dinner: "", hitea: "", remarks: "" };
  const cellOf = (site: string, date: string) => cells[`${site}|${date}`] ?? empty;

  const setField = (site: string, date: string, field: keyof Cell, value: string) => {
    if (field !== "remarks" && value !== "" && !/^\d{1,6}$/.test(value)) return; // whole numbers only
    setCells((c) => ({ ...c, [`${site}|${date}`]: { ...(c[`${site}|${date}`] ?? empty), [field]: value } }));
  };

  const startEdit = (site: string, date: string) => {
    if (editing && editing !== `${site}|${date}`) cancelEdit(); // only one day is edited at a time
    setConfirmDelete(null);
    setStatus((s) => ({ ...s, [`${site}|${date}`]: "" }));
    setEditing(`${site}|${date}`);
  };

  const cancelEdit = (key?: string) => {
    const k = key ?? editing;
    if (!k) return;
    setCells((c) => ({ ...c, [k]: saved[k] ?? empty })); // back to what was last saved
    setEditing((e) => (e === k ? null : e));
  };

  const saveDay = (site: string, date: string) => {
    const key = `${site}|${date}`;
    const now = cells[key] ?? empty;
    setStatus((s) => ({ ...s, [key]: "saving" }));
    startTransition(async () => {
      const res = await saveMealsPaxDay({ companyId, site, date, breakfast: num(now.breakfast), lunch: num(now.lunch), dinner: num(now.dinner), hitea: num(now.hitea), remarks: now.remarks.trim() || null });
      if (res.ok) {
        setSaved((s) => ({ ...s, [key]: now }));
        setStatus((s) => ({ ...s, [key]: "saved" }));
        setEditing((e) => (e === key ? null : e));
      } else {
        setStatus((s) => ({ ...s, [key]: res.error }));
      }
    });
  };

  const deleteDay = (site: string, date: string) => {
    const key = `${site}|${date}`;
    setStatus((s) => ({ ...s, [key]: "saving" }));
    startTransition(async () => {
      const res = await deleteMealsPaxDay({ companyId, site, date });
      if (res.ok) {
        setCells((c) => ({ ...c, [key]: empty }));
        setSaved((s) => ({ ...s, [key]: empty }));
        setStatus((s) => ({ ...s, [key]: "deleted" }));
        setConfirmDelete(null);
        setEditing((e) => (e === key ? null : e));
      } else {
        setStatus((s) => ({ ...s, [key]: res.error }));
      }
    });
  };

  const totalsOf = (site: string) => {
    const t = { breakfast: 0, lunch: 0, dinner: 0, hitea: 0 };
    for (const d of days) {
      const c = cellOf(site, d);
      t.breakfast += num(c.breakfast) ?? 0;
      t.lunch += num(c.lunch) ?? 0;
      t.dinner += num(c.dinner) ?? 0;
      t.hitea += num(c.hitea) ?? 0;
    }
    const p = pricesOf(site);
    const amount = p ? t.breakfast * p.breakfast + t.lunch * p.lunch + t.dinner * p.dinner : 0;
    return { ...t, total: t.breakfast + t.lunch + t.dinner + t.hitea, amount };
  };
  const siteTotals = sites.map((s) => ({ site: s, ...totalsOf(s) }));
  const grand = siteTotals.reduce((g, r) => ({ breakfast: g.breakfast + r.breakfast, lunch: g.lunch + r.lunch, dinner: g.dinner + r.dinner, hitea: g.hitea + r.hitea, total: g.total + r.total, amount: g.amount + r.amount }), { breakfast: 0, lunch: 0, dinner: 0, hitea: 0, total: 0, amount: 0 });

  const download = () => {
    const wb = XLSX.utils.book_new();
    const summary: (string | number)[][] = [
      ["MONTHLY MEALS & PAX SUMMARY"],
      [`${monthLabel} | ${companyName} | Monthly meal attendance by location`],
      [],
      ["Location", "Price per pax", "Breakfast Pax", "Lunch Pax", "Dinner Pax", "Hi-tea Pax", "Total Pax", "Amount (RM)"],
      ...siteTotals.map((r): (string | number)[] => [r.site, priceNote(pricesOf(r.site)), r.breakfast, r.lunch, r.dinner, r.hitea, r.total, Math.round(r.amount * 100) / 100]),
      ["GRAND TOTAL", "", grand.breakfast, grand.lunch, grand.dinner, grand.hitea, grand.total, Math.round(grand.amount * 100) / 100],
      [],
      ["Hi-tea has no price and is not charged."],
    ];
    const s0 = XLSX.utils.aoa_to_sheet(summary);
    s0["!cols"] = [{ wch: 18 }, { wch: 26 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, s0, "Monthly Summary");
    for (const site of sites) {
      const rows: (string | number)[][] = [[`${site} | MONTHLY MEALS & PAX RECORD`], [monthLabel], [], ["Date", "Day", "Breakfast Pax", "Lunch Pax", "Dinner Pax", "Hi-tea Pax", "Remarks"]];
      for (const d of days) {
        const c = cellOf(site, d);
        rows.push([shortDate(d), weekday(d), num(c.breakfast) ?? "", num(c.lunch) ?? "", num(c.dinner) ?? "", num(c.hitea) ?? "", c.remarks]);
      }
      const t = totalsOf(site);
      rows.push(["MONTHLY TOTAL", "", t.breakfast, t.lunch, t.dinner, t.hitea, ""]);
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 28 }];
      XLSX.utils.book_append_sheet(wb, ws, site.slice(0, 31));
    }
    XLSX.writeFile(wb, `${monthLabel.replace(" ", "_")}_Meals_Pax_Tracker.xlsx`);
  };

  const tabs = ["Summary", ...sites];
  const inputCls = "w-20 rounded-md border border-border-strong bg-white px-2 py-1.5 text-right text-[13.5px] outline-none focus:border-primary";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-lg border px-4 py-2 text-[13.5px] font-semibold ${tab === t ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text"}`}>
            {t}
          </button>
        ))}
        <button type="button" onClick={download} className="ml-auto rounded-lg border border-border-strong bg-surface px-4 py-2 text-[13.5px] font-semibold text-text">
          Download Excel
        </button>
      </div>

      {tab === "Summary" ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="mb-3 text-[15px] font-bold text-text">Monthly Meals &amp; Pax Summary · {monthLabel}</div>
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
                <th className="py-2 pr-3">Location</th>
                {MEALS.map((m) => (
                  <th key={m.key} className="py-2 pr-3 text-right">{m.label}</th>
                ))}
                <th className="py-2 pr-3 text-right">Total Pax</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {siteTotals.map((r) => (
                <tr key={r.site} className="border-t border-border">
                  <td className="py-2 pr-3 font-semibold text-text">
                    <button type="button" className="hover:underline" onClick={() => setTab(r.site)}>{r.site}</button>
                    <div className="text-[11.5px] font-normal text-text-muted">{priceNote(pricesOf(r.site))}</div>
                  </td>
                  <td className="py-2 pr-3 text-right">{fmt(r.breakfast)}</td>
                  <td className="py-2 pr-3 text-right">{fmt(r.lunch)}</td>
                  <td className="py-2 pr-3 text-right">{fmt(r.dinner)}</td>
                  <td className="py-2 pr-3 text-right">{fmt(r.hitea)}</td>
                  <td className="py-2 pr-3 text-right font-semibold text-text">{fmt(r.total)}</td>
                  <td className="whitespace-nowrap py-2 text-right font-semibold text-text">{rm(r.amount)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-border-strong font-bold text-text">
                <td className="py-2 pr-3">GRAND TOTAL</td>
                <td className="py-2 pr-3 text-right">{fmt(grand.breakfast)}</td>
                <td className="py-2 pr-3 text-right">{fmt(grand.lunch)}</td>
                <td className="py-2 pr-3 text-right">{fmt(grand.dinner)}</td>
                <td className="py-2 pr-3 text-right">{fmt(grand.hitea)}</td>
                <td className="py-2 pr-3 text-right">{fmt(grand.total)}</td>
                <td className="whitespace-nowrap py-2 text-right">{rm(grand.amount)}</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-3 text-[12.5px] text-text-muted">Enter the pax in each location&apos;s tab. Leave Hi-tea blank on days when it is not required. Amount = pax × price per pax (JDT 3, JDT 4, UTM: breakfast RM10, lunch RM15, dinner RM15; JDT 2: RM25 per meal). Hi-tea is not charged.</div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="mb-3 text-[15px] font-bold text-text">{tab} · Monthly Meals &amp; Pax Record · {monthLabel}</div>
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Day</th>
                {MEALS.map((m) => (
                  <th key={m.key} className="py-2 pr-3">{m.label}</th>
                ))}
                <th className="py-2 pr-3">Remarks</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {days.map((d) => {
                const c = cellOf(tab, d);
                const key = `${tab}|${d}`;
                const st = status[key];
                const weekend = ["Saturday", "Sunday"].includes(weekday(d));
                const isEditing = editing === key;
                const hasData = !!(c.breakfast || c.lunch || c.dinner || c.hitea || c.remarks);
                return (
                  <tr key={d} className={`border-t border-border ${weekend ? "bg-surface-alt" : ""}`}>
                    <td className="whitespace-nowrap py-1.5 pr-3 font-semibold text-text">{shortDate(d)}</td>
                    <td className="py-1.5 pr-3 text-text-secondary">{weekday(d)}</td>
                    {MEALS.map((m) => (
                      <td key={m.key} className="py-1.5 pr-3">
                        {isEditing ? (
                          <input inputMode="numeric" aria-label={`${m.label} ${shortDate(d)}`} className={inputCls} value={c[m.key]} onChange={(e) => setField(tab, d, m.key, e.target.value)} />
                        ) : (
                          <span className="block w-20 px-2 py-1.5 text-right text-[13.5px] text-text">{c[m.key]}</span>
                        )}
                      </td>
                    ))}
                    <td className="py-1.5 pr-3">
                      {isEditing ? (
                        <input aria-label={`Remarks ${shortDate(d)}`} className="w-52 rounded-md border border-border-strong bg-white px-2 py-1.5 text-[13.5px] outline-none focus:border-primary" value={c.remarks} onChange={(e) => setField(tab, d, "remarks", e.target.value)} />
                      ) : (
                        <span className="text-text-secondary">{c.remarks}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-1.5 text-[12.5px]">
                      {isEditing ? (
                        <span className="flex items-center gap-1.5">
                          <button type="button" disabled={st === "saving"} onClick={() => saveDay(tab, d)} className="rounded-md bg-primary px-3 py-1 font-semibold text-white disabled:opacity-60">Save</button>
                          <button type="button" disabled={st === "saving"} onClick={() => cancelEdit(key)} className="rounded-md border border-border-strong bg-surface px-3 py-1 font-semibold text-text">Cancel</button>
                        </span>
                      ) : confirmDelete === key ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-danger">Delete this day?</span>
                          <button type="button" disabled={st === "saving"} onClick={() => deleteDay(tab, d)} className="rounded-md border border-danger bg-danger-bg px-3 py-1 font-semibold text-danger disabled:opacity-60">Yes, delete</button>
                          <button type="button" onClick={() => setConfirmDelete(null)} className="rounded-md border border-border-strong bg-surface px-3 py-1 font-semibold text-text">No</button>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <button type="button" onClick={() => startEdit(tab, d)} className="rounded-md border border-border-strong bg-surface px-3 py-1 font-semibold text-text">Edit</button>
                          {hasData && (
                            <button type="button" onClick={() => { cancelEdit(); setConfirmDelete(key); }} className="rounded-md border border-border-strong bg-surface px-3 py-1 font-semibold text-danger">Delete</button>
                          )}
                        </span>
                      )}
                      {st === "saving" && <span className="ml-2 text-text-muted">Saving…</span>}
                      {st === "saved" && !isEditing && <span className="ml-2 text-success">Saved</span>}
                      {st === "deleted" && !isEditing && <span className="ml-2 text-text-muted">Deleted</span>}
                      {st && st !== "saving" && st !== "saved" && st !== "deleted" && <span className="ml-2 text-danger">{st}</span>}
                    </td>
                  </tr>
                );
              })}
              {(() => {
                const t = totalsOf(tab);
                return (
                  <tr className="border-t-2 border-border-strong font-bold text-text">
                    <td className="py-2 pr-3" colSpan={2}>MONTHLY TOTAL</td>
                    <td className="py-2 pr-3 pl-2">{fmt(t.breakfast)}</td>
                    <td className="py-2 pr-3 pl-2">{fmt(t.lunch)}</td>
                    <td className="py-2 pr-3 pl-2">{fmt(t.dinner)}</td>
                    <td className="py-2 pr-3 pl-2">{fmt(t.hitea)}</td>
                    <td colSpan={2} />
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
