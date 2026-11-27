"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { addFuelLog, addRepair, deleteFuelLog, saveVehicleDetails, saveVehiclePart } from "@/lib/driver/vehicleConditionActions";
import { ANNUAL_CHECKS, FUEL_TYPES, nextDue, type FuelLog, type ScheduleItem, type TyreRow, type VehicleProfile, type BatteryInfo } from "@/lib/driver/vehicleCondition";
import { Select } from "@/components/ui/Select";

const input = "mt-1 h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-[13.5px] outline-none focus:border-primary";
const cell = "h-8 w-full rounded border border-border-strong bg-surface px-1.5 text-[12.5px] outline-none focus:border-primary";
const label = "text-[12px] font-semibold text-text-secondary";
const btn = "h-9 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-semibold text-text hover:bg-surface-alt disabled:opacity-60";
const primary = "h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white disabled:opacity-60";
const todayMy = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const fmtDate = (d: string | null | undefined) => (d ? new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${d}T00:00:00Z`)) : "—");
const km = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${Math.round(n).toLocaleString("en-MY")} km`);
const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setBusy(true);
    setError(null);
    setSaved(false);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "Something went wrong.");
    setSaved(true);
    after?.();
    router.refresh();
  }
  return { busy, error, saved, run };
}

function Card({ icon, title, hint, action, children }: { icon: string; title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-xl border-b border-border bg-surface-alt px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[18px]" aria-hidden="true">{icon}</span>
          <div>
            <h2 className="text-[14.5px] font-extrabold uppercase tracking-wide text-text">{title}</h2>
            {hint && <div className="text-[12px] text-text-secondary">{hint}</div>}
          </div>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Feedback({ error, saved }: { error: string | null; saved: boolean }) {
  if (error) return <span className="text-[12.5px] font-semibold text-danger">{error}</span>;
  if (saved) return <span className="text-[12.5px] font-semibold text-success">Saved ✓</span>;
  return null;
}

// ---------- vehicle details ----------

function Details({ vehicleId, p, plate, insuranceExpiry, roadTaxExpiry }: { vehicleId: string; p: VehicleProfile; plate: string; insuranceExpiry: string | null; roadTaxExpiry: string | null }) {
  const { busy, error, saved, run } = useRun();
  const [edit, setEdit] = useState(false);
  const blank = () => ({
    make: p.make ?? "",
    model: p.model ?? "",
    year: p.year ? String(p.year) : "",
    colour: p.colour ?? "",
    nickname: p.nickname ?? "",
    chassis_no: p.chassis_no ?? "",
    engine_no: p.engine_no ?? "",
    fuel_type: p.fuel_type ?? "",
    odometer_km: p.odometer_km !== null ? String(p.odometer_km) : "",
    insurance_company: p.insurance_company ?? "",
    policy_number: p.policy_number ?? "",
    insurance_expiry: insuranceExpiry ?? "",
    road_tax_expiry: roadTaxExpiry ?? "",
    notes: p.notes ?? "",
  });
  const [f, setF] = useState(blank);
  const field = (k: keyof ReturnType<typeof blank>, l: string, type = "text") => (
    <div>
      <label className={label}>{l}</label>
      <input type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={input} />
    </div>
  );
  const view: [string, string][] = [
    ["Make", p.make ?? "—"],
    ["Model", p.model ?? "—"],
    ["Year", p.year ? String(p.year) : "—"],
    ["Colour", p.colour ?? "—"],
    ["Nickname", p.nickname ?? "—"],
    ["Plate number", plate],
    ["Chassis no. (VIN)", p.chassis_no ?? "—"],
    ["Engine no.", p.engine_no ?? "—"],
    ["Odometer (current)", p.odometer_km !== null ? `${km(p.odometer_km)}${p.odometer_date ? ` (on ${fmtDate(p.odometer_date)})` : ""}` : "—"],
    ["Fuel type", p.fuel_type ? FUEL_TYPES[p.fuel_type] : "—"],
    ["Insurance company", p.insurance_company ?? "—"],
    ["Policy number", p.policy_number ?? "—"],
    ["Insurance renewal", fmtDate(insuranceExpiry)],
    ["Road tax expiry", fmtDate(roadTaxExpiry)],
  ];
  return (
    <Card
      icon="🚐"
      title="Vehicle details"
      hint="Kept once for this van (the same for Kasturi, Signature and O2)."
      action={
        !edit && (
          <button type="button" onClick={() => { setF(blank()); setEdit(true); }} className={btn}>
            Edit details
          </button>
        )
      }
    >
      {!edit ? (
        <>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-3 lg:grid-cols-5">
            {view.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{k}</dt>
                <dd className={`font-semibold ${v === "—" ? "text-text-muted" : "text-text"}`}>{v}</dd>
              </div>
            ))}
          </dl>
          {p.notes && <div className="mt-3 whitespace-pre-line rounded-lg bg-surface-alt px-3 py-2 text-[13px] text-text">{p.notes}</div>}
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () =>
                saveVehicleDetails(vehicleId, {
                  ...f,
                  year: f.year ? Number(f.year) : null,
                  odometer_km: f.odometer_km ? Number(f.odometer_km) : null,
                }),
              () => setEdit(false),
            );
          }}
          className="flex flex-col gap-3"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {field("make", "Make (e.g. Toyota)")}
            {field("model", "Model (e.g. Hiace)")}
            {field("year", "Year", "number")}
            {field("colour", "Colour")}
            {field("nickname", "Nickname")}
            {field("chassis_no", "Chassis no. (VIN)")}
            {field("engine_no", "Engine no.")}
            {field("odometer_km", "Odometer now (km)", "number")}
            <div>
              <label className={label}>Fuel type</label>
              <Select value={f.fuel_type} onChange={(e) => setF({ ...f, fuel_type: e.target.value })} className={input}>
                <option value="">—</option>
                {Object.entries(FUEL_TYPES).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </Select>
            </div>
            {field("insurance_company", "Insurance company")}
            {field("policy_number", "Policy number")}
            {field("insurance_expiry", "Insurance renewal date", "date")}
            {field("road_tax_expiry", "Road tax expiry", "date")}
          </div>
          <div>
            <label className={label}>Notes</label>
            <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className={`${input} h-20 py-2`} />
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={busy} className={primary}>{busy ? "Saving..." : "Save details"}</button>
            <button type="button" onClick={() => setEdit(false)} className={btn}>Cancel</button>
            <Feedback error={error} saved={false} />
          </div>
        </form>
      )}
      {!edit && <div className="mt-1"><Feedback error={null} saved={saved} /></div>}
    </Card>
  );
}

// ---------- maintenance schedule ----------

const STATE_STYLE = { ok: "bg-success-bg text-success", soon: "bg-yellow-100 text-yellow-900", overdue: "bg-danger-bg text-danger", unknown: "bg-surface-alt text-text-muted" };
const STATE_TEXT = { ok: "OK", soon: "Due soon", overdue: "Overdue", unknown: "Not recorded" };

function Schedule({ vehicleId, p }: { vehicleId: string; p: VehicleProfile }) {
  const { busy, error, saved, run } = useRun();
  const [rows, setRows] = useState<ScheduleItem[]>(p.schedule);
  const [dirty, setDirty] = useState(false);
  const today = todayMy();
  const set = (i: number, patch: Partial<ScheduleItem>) => {
    setRows(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const counts = rows.reduce((c, r) => ({ ...c, [nextDue(r, p.odometer_km, today).state]: (c[nextDue(r, p.odometer_km, today).state] ?? 0) + 1 }), {} as Record<string, number>);
  return (
    <Card
      icon="🔧"
      title="Maintenance schedule"
      hint={`Every item, how often, when it was last done and when it is next due${p.odometer_km !== null ? ` (odometer now ${km(p.odometer_km)})` : " (enter the odometer in Vehicle details for the km due)"}.`}
      action={
        <div className="flex flex-wrap gap-1.5 text-[12px] font-bold">
          {(["overdue", "soon"] as const).map((s) => (counts[s] ? <span key={s} className={`rounded-full px-2 py-0.5 ${STATE_STYLE[s]}`}>{`${counts[s]} ${STATE_TEXT[s]}`}</span> : null))}
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-[12.5px]">
          <thead className="text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
            <tr>
              <th className="pb-2 pr-2">Service item</th>
              <th className="pb-2 pr-2">Every (km)</th>
              <th className="pb-2 pr-2">Every (months)</th>
              <th className="pb-2 pr-2">Last done (date)</th>
              <th className="pb-2 pr-2">Last done (km)</th>
              <th className="pb-2 pr-2">Next due</th>
              <th className="pb-2 pr-2">Status</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => {
              const due = nextDue(r, p.odometer_km, today);
              return (
                <tr key={i} className="align-middle">
                  <td className="py-1 pr-2"><input value={r.item} onChange={(e) => set(i, { item: e.target.value })} className={`${cell} font-semibold`} /></td>
                  <td className="py-1 pr-2"><input type="number" min={0} value={r.interval_km ?? ""} onChange={(e) => set(i, { interval_km: numOrNull(e.target.value) })} className={`${cell} w-24`} placeholder="—" /></td>
                  <td className="py-1 pr-2"><input type="number" min={0} value={r.interval_months ?? ""} onChange={(e) => set(i, { interval_months: numOrNull(e.target.value) })} className={`${cell} w-20`} placeholder="—" /></td>
                  <td className="py-1 pr-2"><input type="date" value={r.last_done_date ?? ""} onChange={(e) => set(i, { last_done_date: e.target.value || null })} className={`${cell} w-36`} /></td>
                  <td className="py-1 pr-2"><input type="number" min={0} value={r.last_done_km ?? ""} onChange={(e) => set(i, { last_done_km: numOrNull(e.target.value) })} className={`${cell} w-28`} placeholder="—" /></td>
                  <td className="whitespace-nowrap py-1 pr-2 text-text-secondary">{[due.date ? fmtDate(due.date) : "", due.km !== null ? km(due.km) : ""].filter(Boolean).join(" / ") || "—"}</td>
                  <td className="py-1 pr-2"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-bold ${STATE_STYLE[due.state]}`}>{STATE_TEXT[due.state]}</span></td>
                  <td className="whitespace-nowrap py-1">
                    <button type="button" onClick={() => set(i, { last_done_date: today, last_done_km: p.odometer_km ?? r.last_done_km })} className="text-[12px] font-semibold text-primary hover:underline">
                      Done today
                    </button>
                    <button type="button" onClick={() => { setRows(rows.filter((_, n) => n !== i)); setDirty(true); }} className="ml-2 text-[12px] font-semibold text-text-muted hover:text-danger" aria-label="Remove item">
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { setRows([...rows, { item: "", interval_km: null, interval_months: null, last_done_date: null, last_done_km: null, notes: null }]); setDirty(true); }} className={btn}>
          + Add item
        </button>
        <button type="button" disabled={busy || !dirty} onClick={() => void run(() => saveVehiclePart(vehicleId, { schedule: rows }), () => setDirty(false))} className={primary}>
          {busy ? "Saving..." : "Save schedule"}
        </button>
        {dirty && <span className="text-[12.5px] font-semibold text-yellow-800">Not saved yet</span>}
        <Feedback error={error} saved={saved && !dirty} />
      </div>
    </Card>
  );
}

// ---------- fuel log ----------

function Fuel({ vehicleId, logs }: { vehicleId: string; logs: FuelLog[] }) {
  const { busy, error, saved, run } = useRun();
  const blank = () => ({ fillDate: todayMy(), odometerKm: "", litres: "", cost: "", station: "", notes: "" });
  const [f, setF] = useState(blank);
  // km per litre: the distance since the previous fill-up (with an odometer) ÷ the litres of this fill-up
  const sorted = [...logs].sort((a, b) => a.fill_date.localeCompare(b.fill_date) || Number(a.odometer_km ?? 0) - Number(b.odometer_km ?? 0));
  const kmpl = new Map<string, number>();
  let prev: FuelLog | null = null;
  for (const l of sorted) {
    if (prev && prev.odometer_km !== null && l.odometer_km !== null && l.litres && Number(l.odometer_km) > Number(prev.odometer_km)) kmpl.set(l.id, (Number(l.odometer_km) - Number(prev.odometer_km)) / Number(l.litres));
    if (l.odometer_km !== null) prev = l;
  }
  const totalCost = logs.reduce((t, l) => t + Number(l.cost ?? 0), 0);
  const avg = kmpl.size > 0 ? [...kmpl.values()].reduce((t, v) => t + v, 0) / kmpl.size : null;
  return (
    <Card icon="⛽" title="Fuel log" hint={`${logs.length} fill-up(s) · RM${totalCost.toFixed(2)}${avg ? ` · average ${avg.toFixed(1)} km per litre` : ""}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => addFuelLog(vehicleId, { fillDate: f.fillDate, odometerKm: numOrNull(f.odometerKm), litres: numOrNull(f.litres), cost: numOrNull(f.cost), station: f.station, notes: f.notes }), () => setF(blank()));
        }}
        className="grid grid-cols-2 items-end gap-2 sm:grid-cols-3"
      >
        <div><label className={label}>Date</label><input type="date" required value={f.fillDate} onChange={(e) => setF({ ...f, fillDate: e.target.value })} className={input} /></div>
        <div><label className={label}>Odometer (km)</label><input type="number" min={0} value={f.odometerKm} onChange={(e) => setF({ ...f, odometerKm: e.target.value })} className={input} /></div>
        <div><label className={label}>Litres</label><input type="number" min={0} step="0.01" value={f.litres} onChange={(e) => setF({ ...f, litres: e.target.value })} className={input} /></div>
        <div><label className={label}>Cost (RM)</label><input type="number" min={0} step="0.01" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} className={input} /></div>
        <div><label className={label}>Station</label><input value={f.station} onChange={(e) => setF({ ...f, station: e.target.value })} className={input} placeholder="e.g. Petronas" /></div>
        <div><label className={label}>Notes</label><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className={input} /></div>
        <button type="submit" disabled={busy} className={primary}>{busy ? "Saving..." : "+ Add"}</button>
      </form>
      <div className="mt-1"><Feedback error={error} saved={saved} /></div>
      {logs.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <tr><th className="py-1.5 pr-2">Date</th><th className="pr-2">Odometer</th><th className="pr-2">Litres</th><th className="pr-2">Cost</th><th className="pr-2">km / litre</th><th className="pr-2">Station / notes</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap py-1.5 pr-2 font-semibold text-text">{fmtDate(l.fill_date)}</td>
                  <td className="pr-2">{km(l.odometer_km)}</td>
                  <td className="pr-2">{l.litres ? `${Number(l.litres).toFixed(2)} L` : "—"}</td>
                  <td className="pr-2">{l.cost !== null ? `RM${Number(l.cost).toFixed(2)}` : "—"}</td>
                  <td className="pr-2">{kmpl.has(l.id) ? kmpl.get(l.id)!.toFixed(1) : "—"}</td>
                  <td className="pr-2 text-text-secondary">{[l.station, l.notes].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="text-right">
                    <DeleteFuel vehicleId={vehicleId} id={l.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function DeleteFuel({ vehicleId, id }: { vehicleId: string; id: string }) {
  const { busy, run } = useRun();
  return (
    <button type="button" disabled={busy} onClick={() => window.confirm("Remove this fuel record?") && void run(() => deleteFuelLog(vehicleId, id))} className="text-[12px] font-semibold text-text-muted hover:text-danger">
      Remove
    </button>
  );
}

// ---------- tyres & battery ----------

function Tyres({ vehicleId, p }: { vehicleId: string; p: VehicleProfile }) {
  const { busy, error, saved, run } = useRun();
  const [rows, setRows] = useState<TyreRow[]>(p.tyres);
  const [dirty, setDirty] = useState(false);
  const set = (i: number, patch: Partial<TyreRow>) => {
    setRows(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  return (
    <Card icon="🛞" title="Tyre information">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[12.5px]">
          <thead className="text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
            <tr><th className="pb-2 pr-2">Tyre</th><th className="pb-2 pr-2">Brand / type</th><th className="pb-2 pr-2">Size</th><th className="pb-2 pr-2">Fitted on</th><th className="pb-2 pr-2">Odometer (km)</th><th className="pb-2">Notes</th></tr>
          </thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={t.position}>
                <td className="py-1 pr-2 font-semibold text-text">{t.position}</td>
                <td className="py-1 pr-2"><input value={t.brand ?? ""} onChange={(e) => set(i, { brand: e.target.value })} className={cell} /></td>
                <td className="py-1 pr-2"><input value={t.size ?? ""} onChange={(e) => set(i, { size: e.target.value })} className={`${cell} w-28`} placeholder="195R15C" /></td>
                <td className="py-1 pr-2"><input type="date" value={t.purchase_date ?? ""} onChange={(e) => set(i, { purchase_date: e.target.value || null })} className={`${cell} w-36`} /></td>
                <td className="py-1 pr-2"><input type="number" min={0} value={t.odometer_km ?? ""} onChange={(e) => set(i, { odometer_km: numOrNull(e.target.value) })} className={`${cell} w-28`} /></td>
                <td className="py-1"><input value={t.notes ?? ""} onChange={(e) => set(i, { notes: e.target.value })} className={cell} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" disabled={busy || !dirty} onClick={() => void run(() => saveVehiclePart(vehicleId, { tyres: rows }), () => setDirty(false))} className={primary}>{busy ? "Saving..." : "Save tyres"}</button>
        {dirty && <span className="text-[12.5px] font-semibold text-yellow-800">Not saved yet</span>}
        <Feedback error={error} saved={saved && !dirty} />
      </div>
    </Card>
  );
}

function Battery({ vehicleId, p }: { vehicleId: string; p: VehicleProfile }) {
  const { busy, error, saved, run } = useRun();
  const [b, setB] = useState<BatteryInfo>(p.battery);
  const [dirty, setDirty] = useState(false);
  const set = (patch: Partial<BatteryInfo>) => {
    setB({ ...b, ...patch });
    setDirty(true);
  };
  return (
    <Card icon="🔋" title="Battery information">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div><label className={label}>Brand</label><input value={b.brand ?? ""} onChange={(e) => set({ brand: e.target.value })} className={input} /></div>
        <div><label className={label}>Bought / fitted on</label><input type="date" value={b.purchase_date ?? ""} onChange={(e) => set({ purchase_date: e.target.value || null })} className={input} /></div>
        <div><label className={label}>Voltage / model</label><input value={b.voltage ?? ""} onChange={(e) => set({ voltage: e.target.value })} className={input} placeholder="e.g. 12V NS60" /></div>
        <div><label className={label}>Warranty</label><input value={b.warranty ?? ""} onChange={(e) => set({ warranty: e.target.value })} className={input} placeholder="e.g. 12 months" /></div>
        <div><label className={label}>Replace by</label><input type="date" value={b.replacement_date ?? ""} onChange={(e) => set({ replacement_date: e.target.value || null })} className={input} /></div>
        <div><label className={label}>Notes</label><input value={b.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} className={input} /></div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" disabled={busy || !dirty} onClick={() => void run(() => saveVehiclePart(vehicleId, { battery: b }), () => setDirty(false))} className={primary}>{busy ? "Saving..." : "Save battery"}</button>
        <Feedback error={error} saved={saved && !dirty} />
      </div>
    </Card>
  );
}

// ---------- repairs & services ----------

export type RepairRow = { id: string; service_date: string; odometer_km: number | null; service_type: string | null; cost: number | null; workshop: string | null; notes: string | null; next_service_date: string | null };

function Repairs({ vehicleId, rows, odometer }: { vehicleId: string; rows: RepairRow[]; odometer: number | null }) {
  const { busy, error, saved, run } = useRun();
  const [open, setOpen] = useState(false);
  const blank = () => ({ serviceDate: todayMy(), odometerKm: odometer !== null ? String(odometer) : "", serviceType: "", cost: "", workshop: "", notes: "", nextServiceDate: "" });
  const [f, setF] = useState(blank);
  const total = rows.reduce((t, r) => t + Number(r.cost ?? 0), 0);
  return (
    <Card
      icon="⚙️"
      title="Other repairs & services"
      hint={`${rows.length} record(s) · RM${total.toFixed(2)}`}
      action={!open && <button type="button" onClick={() => setOpen(true)} className={primary}>+ Record repair / service</button>}
    >
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => addRepair(vehicleId, { ...f, odometerKm: numOrNull(f.odometerKm), cost: numOrNull(f.cost) }), () => { setF(blank()); setOpen(false); });
          }}
          className="mb-4 rounded-lg bg-surface-alt p-3"
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div><label className={label}>Date *</label><input type="date" required value={f.serviceDate} onChange={(e) => setF({ ...f, serviceDate: e.target.value })} className={input} /></div>
            <div><label className={label}>Odometer (km)</label><input type="number" min={0} value={f.odometerKm} onChange={(e) => setF({ ...f, odometerKm: e.target.value })} className={input} /></div>
            <div className="col-span-2"><label className={label}>Service / repair *</label><input required value={f.serviceType} onChange={(e) => setF({ ...f, serviceType: e.target.value })} className={input} placeholder="e.g. Engine oil change, brake pads" /></div>
            <div><label className={label}>Cost (RM)</label><input type="number" min={0} step="0.01" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} className={input} /></div>
            <div><label className={label}>Workshop / mechanic</label><input value={f.workshop} onChange={(e) => setF({ ...f, workshop: e.target.value })} className={input} /></div>
            <div><label className={label}>Next service date</label><input type="date" value={f.nextServiceDate} onChange={(e) => setF({ ...f, nextServiceDate: e.target.value })} className={input} /></div>
            <div><label className={label}>Notes</label><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className={input} /></div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button type="submit" disabled={busy} className={primary}>{busy ? "Saving..." : "Save"}</button>
            <button type="button" onClick={() => setOpen(false)} className={btn}>Cancel</button>
            <Feedback error={error} saved={false} />
          </div>
          <p className="mt-1 text-[11.5px] text-text-muted">Tip: after a service, also press &quot;Done today&quot; on that item in the Maintenance schedule, then Save schedule.</p>
        </form>
      )}
      {!open && <Feedback error={null} saved={saved} />}
      {rows.length === 0 ? (
        <div className="text-[13px] text-text-muted">No repair or service recorded yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <tr><th className="py-1.5 pr-2">Date</th><th className="pr-2">Odometer</th><th className="pr-2">Service / repair</th><th className="pr-2">Cost</th><th className="pr-2">Workshop</th><th className="pr-2">Next service</th><th>Notes</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap py-1.5 pr-2 font-semibold text-text">{fmtDate(r.service_date)}</td>
                  <td className="pr-2">{km(r.odometer_km)}</td>
                  <td className="pr-2 font-semibold text-text">{r.service_type ?? "—"}</td>
                  <td className="pr-2">{`RM${Number(r.cost ?? 0).toFixed(2)}`}</td>
                  <td className="pr-2">{r.workshop ?? "—"}</td>
                  <td className="whitespace-nowrap pr-2">{fmtDate(r.next_service_date)}</td>
                  <td className="text-text-secondary">{r.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ---------- annual checklist ----------

function Checklist({ vehicleId, p }: { vehicleId: string; p: VehicleProfile }) {
  const { busy, error, run } = useRun();
  const year = todayMy().slice(0, 4);
  const done = ANNUAL_CHECKS.filter(([k]) => p.annual_checklist[k]?.startsWith(year)).length;
  const tick = (key: string, on: boolean) => {
    const next = { ...p.annual_checklist };
    if (on) next[key] = todayMy();
    else delete next[key];
    void run(() => saveVehiclePart(vehicleId, { annual_checklist: next }));
  };
  return (
    <Card icon="✅" title={`Annual checklist ${year}`} hint={`${done} of ${ANNUAL_CHECKS.length} done this year. Tick a check when it is done (the date is kept).`}>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {ANNUAL_CHECKS.map(([k, l]) => {
          const last = p.annual_checklist[k];
          const thisYear = !!last?.startsWith(year);
          return (
            <li key={k}>
              <label className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-[13px] ${thisYear ? "border-success/40 bg-success-bg" : "border-border bg-surface"}`}>
                <input type="checkbox" disabled={busy} checked={thisYear} onChange={(e) => tick(k, e.target.checked)} className="mt-0.5 h-4 w-4" />
                <span>
                  <span className="font-semibold text-text">{l}</span>
                  <span className="block text-[11.5px] text-text-muted">{last ? `Last checked ${fmtDate(last)}` : "Not checked yet"}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {error && <div className="mt-2 text-[12.5px] font-semibold text-danger">{error}</div>}
    </Card>
  );
}

/** The vehicle's condition & maintenance records, laid out like a "Vehicle Maintenance & Records" sheet. */
export function VehicleConditionBoard({
  vehicleId,
  plate,
  profile,
  fuel,
  repairs,
  insuranceExpiry,
  roadTaxExpiry,
}: {
  vehicleId: string;
  plate: string;
  profile: VehicleProfile;
  fuel: FuelLog[];
  repairs: RepairRow[];
  insuranceExpiry: string | null;
  roadTaxExpiry: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Details vehicleId={vehicleId} p={profile} plate={plate} insuranceExpiry={insuranceExpiry} roadTaxExpiry={roadTaxExpiry} />
      <Schedule vehicleId={vehicleId} p={profile} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Fuel vehicleId={vehicleId} logs={fuel} />
        <div className="flex flex-col gap-4">
          <Tyres vehicleId={vehicleId} p={profile} />
          <Battery vehicleId={vehicleId} p={profile} />
        </div>
      </div>
      <Repairs vehicleId={vehicleId} rows={repairs} odometer={profile.odometer_km} />
      <Checklist vehicleId={vehicleId} p={profile} />
    </div>
  );
}
