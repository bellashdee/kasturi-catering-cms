"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MILEAGE_RATE_RM, PURPOSE_CODES, mileageSummary, type MileageTrip } from "@/lib/hr/mileage";
import { deleteMileageTrip, saveMileageNotes, saveMileageTrip, type MileageTripInput } from "@/lib/hr/mileageActions";
import { openMileagePdf } from "@/lib/hr/mileagePdf";

const field = "h-10 w-full rounded-lg border border-border-strong bg-white px-3 text-[13.5px] outline-none focus:border-primary";
const km = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

type Form = { id?: string; tripDate: string; from: string; to: string; purpose: string; startKm: string; endKm: string; purposeCode: number };

/** The Mileage Log of one staff member for one month: add trips, see the summary and the notes, print it as the mileage log form. */
export function MileageLogBoard({ employeeId, staffName, companyName, month, monthLabel, today, trips, initialNotes }: { employeeId: string; staffName: string; companyName: string; month: string; monthLabel: string; today: string; trips: MileageTrip[]; initialNotes: string }) {
  const router = useRouter();
  const lastEnd = trips.length ? Number(trips[trips.length - 1].end_km) : null;
  const defaultDate = today.startsWith(month) ? today : `${month}-01`;
  const empty = (): Form => ({ tripDate: defaultDate, from: "", to: "", purpose: "", startKm: lastEnd !== null ? String(lastEnd) : "", endKm: "", purposeCode: 1 });
  const [form, setForm] = useState<Form>(empty);
  const [notes, setNotes] = useState(initialNotes);
  const [notesSaved, setNotesSaved] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const s = mileageSummary(trips);
  const total = form.startKm && form.endKm ? Number(form.endKm) - Number(form.startKm) : null;

  const save = () => {
    setError(null);
    const input: MileageTripInput = { id: form.id, employeeId, tripDate: form.tripDate, from: form.from, to: form.to, purpose: form.purpose, startKm: Number(form.startKm), endKm: Number(form.endKm), purposeCode: form.purposeCode };
    startTransition(async () => {
      const res = await saveMileageTrip(input);
      if (res.ok) {
        setForm({ ...empty(), startKm: form.endKm });
        router.refresh();
      } else setError(res.error);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[13px] text-text-secondary">
          {trips.length} trip{trips.length === 1 ? "" : "s"} · <b className="text-text">{km(s.total)} km</b> in {monthLabel} · claim <b className="text-text">RM {s.claim.toFixed(2)}</b>
        </div>
        <button
          type="button"
          onClick={() => openMileagePdf({ staffName, companyName, monthLabel, trips, notes }, window.open("", "_blank"))}
          className="ml-auto h-9 rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-text hover:bg-surface-alt"
        >
          Print Mileage Log (PDF)
        </button>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="mb-3 text-[15px] font-bold text-text">{form.id ? "Edit trip" : "Add a trip"}</div>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
            Date
            <input type="date" max={today} value={form.tripDate} onChange={(e) => setForm({ ...form, tripDate: e.target.value })} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
            From
            <input value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} placeholder="e.g. Office Mount Austin" className={field} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
            To
            <input value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} placeholder="e.g. JDT 4" className={field} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
            Purpose code
            <select value={form.purposeCode} onChange={(e) => setForm({ ...form, purposeCode: Number(e.target.value) })} className={field}>
              {PURPOSE_CODES.map((c) => (
                <option key={c.code} value={c.code}>{c.code} – {c.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary sm:col-span-2">
            Purpose / notes
            <input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="e.g. Deliver food to event" className={field} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
            Start mileage (km)
            <input inputMode="decimal" value={form.startKm} onChange={(e) => setForm({ ...form, startKm: e.target.value })} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-secondary">
            End mileage (km){total !== null && total >= 0 ? <span className="text-text"> → {km(total)} km</span> : null}
            <input inputMode="decimal" value={form.endKm} onChange={(e) => setForm({ ...form, endKm: e.target.value })} className={field} />
          </label>
        </div>
        {error && <div className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div>}
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={pending} onClick={save} className="h-10 rounded-lg bg-primary px-5 text-[13.5px] font-semibold text-white disabled:opacity-60">{pending ? "Saving…" : form.id ? "Save changes" : "Add trip"}</button>
          {form.id && <button type="button" onClick={() => setForm(empty())} className="h-10 rounded-lg border border-border-strong bg-surface px-4 text-[13.5px] font-semibold text-text">Cancel</button>}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full min-w-[860px] text-[13px]">
          <thead>
            <tr className="bg-[#162342] text-left text-[11.5px] font-bold uppercase tracking-wide text-white">
              <th className="px-3 py-2.5">Date</th>
              <th className="px-3 py-2.5">From</th>
              <th className="px-3 py-2.5">To</th>
              <th className="px-3 py-2.5">Purpose / notes</th>
              <th className="px-3 py-2.5 text-right">Start mileage</th>
              <th className="px-3 py-2.5 text-right">End mileage</th>
              <th className="px-3 py-2.5 text-right">Total km</th>
              <th className="px-3 py-2.5 text-center">Purpose code</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {trips.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-text-muted">No trips in {monthLabel} yet.</td></tr>
            ) : (
              trips.map((t) => (
                <tr key={t.id}>
                  <td className="px-3 py-2 font-semibold text-text">{dmy(t.trip_date)}</td>
                  <td className="px-3 py-2">{t.from_place}</td>
                  <td className="px-3 py-2">{t.to_place}</td>
                  <td className="px-3 py-2 text-text-secondary">{t.purpose}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{km(Number(t.start_km))}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{km(Number(t.end_km))}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{km(Number(t.total_km))}</td>
                  <td className="px-3 py-2 text-center">{t.purpose_code}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-[12.5px]">
                    {confirmDelete === t.id ? (
                      <>
                        <button type="button" disabled={pending} onClick={() => startTransition(async () => { const r = await deleteMileageTrip(t.id); if (r.ok) { setConfirmDelete(null); router.refresh(); } else setError(r.error); })} className="mr-2 font-semibold text-danger">Yes, delete</button>
                        <button type="button" onClick={() => setConfirmDelete(null)} className="font-semibold text-text-secondary">No</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => setForm({ id: t.id, tripDate: t.trip_date, from: t.from_place, to: t.to_place, purpose: t.purpose ?? "", startKm: String(t.start_km), endKm: String(t.end_km), purposeCode: t.purpose_code })} className="mr-2 font-semibold text-primary">Edit</button>
                        <button type="button" onClick={() => setConfirmDelete(t.id)} className="font-semibold text-text-secondary hover:text-danger">Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
            <tr className="bg-surface-alt font-bold">
              <td colSpan={6} className="px-3 py-2.5 text-right text-text">TOTAL KM</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-text">{km(s.total)}</td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface shadow-sm">
          <div className="rounded-t-xl bg-[#162342] px-4 py-2 text-center text-[12px] font-bold uppercase tracking-wide text-white">Purpose codes</div>
          <div className="space-y-1 p-4 text-[13px]">
            {PURPOSE_CODES.map((c) => (
              <div key={c.code}>{c.code} – {c.label}</div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface shadow-sm">
          <div className="rounded-t-xl bg-[#162342] px-4 py-2 text-center text-[12px] font-bold uppercase tracking-wide text-white">Summary</div>
          <div className="space-y-1.5 p-4 text-[13px]">
            {[["Business km", s.business], ["Personal km", s.personal], ["Other km", s.other]].map(([l, v]) => (
              <div key={l as string} className="flex justify-between"><span className="text-text-secondary">{l}</span><span className="tabular-nums">{km(v as number)}</span></div>
            ))}
            <div className="flex justify-between rounded-md bg-surface-alt px-2 py-1.5 font-bold"><span>Total km</span><span className="tabular-nums">{km(s.total)}</span></div>
            <div className="mt-1 flex justify-between rounded-md bg-primary px-2 py-2 text-[14px] font-extrabold text-white"><span>Claim (business km × RM{MILEAGE_RATE_RM.toFixed(2)})</span><span className="tabular-nums">RM {s.claim.toFixed(2)}</span></div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface shadow-sm">
          <div className="rounded-t-xl bg-[#162342] px-4 py-2 text-center text-[12px] font-bold uppercase tracking-wide text-white">Notes</div>
          <div className="p-3">
            <textarea rows={4} value={notes} onChange={(e) => { setNotes(e.target.value); setNotesSaved(false); }} className="w-full rounded-lg border border-border-strong p-2 text-[13px] outline-none focus:border-primary" placeholder="Notes for this month" />
            <button
              type="button"
              disabled={notesSaved || pending}
              onClick={() => startTransition(async () => { const r = await saveMileageNotes(employeeId, month, notes); if (r.ok) setNotesSaved(true); else setError(r.error); })}
              className="mt-1.5 h-8 rounded-md border border-border-strong bg-surface px-3 text-[12.5px] font-semibold text-text disabled:opacity-50"
            >
              {notesSaved ? "Saved" : "Save notes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
