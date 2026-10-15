"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveEventSite } from "@/lib/eventAttendance/siteActions";
import { getCurrentPosition } from "@/lib/driverAttendance/geo";

export type SiteRow = { id: string; companyId: string; companyName: string; locationText: string; latitude: number; longitude: number; source: string };

const field = "mt-1 h-9 w-full rounded-lg border border-border-strong bg-surface px-2.5 text-[13.5px]";
const label = "text-[12px] font-semibold text-text-secondary";

/** Admins: where each event location is on the map. People are measured against this point (100 m). */
export function EventSitesPanel({ sites, companies, knownLocations }: { sites: SiteRow[]; companies: { id: string; name: string }[]; knownLocations: { companyId: string; text: string }[] }) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [text, setText] = useState("");
  const [coords, setCoords] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const hints = knownLocations.filter((k) => k.companyId === companyId);

  async function fillFromMyPosition() {
    setError(null);
    try {
      const p = await getCurrentPosition();
      setCoords(`${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not get your location.");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await saveEventSite({ companyId, locationText: text, coordinates: coords });
      setSaved(true);
      setText("");
      setCoords("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div>
        <div className="text-[15px] font-bold text-text">Event locations on the map</div>
        <p className="mt-1 text-[13px] text-text-secondary">
          The first time an event location is used it is looked up on the map automatically. If a driver or part-timer at the venue is told they are too far away, set the exact point here (stand at the venue and use your own position, or paste coordinates or a Google Maps link).
        </p>
      </div>

      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="site-company">Company</label>
          <select id="site-company" className={field} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="site-text">Event location (as written on the form)</label>
          <input id="site-text" className={field} list="site-hints" value={text} onChange={(e) => setText(e.target.value)} required />
          <datalist id="site-hints">
            {hints.map((h) => (
              <option key={h.text} value={h.text} />
            ))}
          </datalist>
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="site-coords">Coordinates or Google Maps link</label>
          <div className="flex gap-2">
            <input id="site-coords" className={field} value={coords} onChange={(e) => setCoords(e.target.value)} placeholder="1.492700, 103.741400" required />
            <button type="button" onClick={() => void fillFromMyPosition()} className="mt-1 h-9 shrink-0 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-semibold text-text">Use my position</button>
          </div>
        </div>
        {error && <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[13px] text-danger sm:col-span-2">{error}</div>}
        {saved && <div role="status" className="rounded-lg border border-success/30 bg-success-bg px-3 py-2 text-[13px] font-semibold text-success sm:col-span-2">Saved.</div>}
        <div className="sm:col-span-2"><button type="submit" disabled={busy} className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white disabled:opacity-60">{busy ? "Saving..." : "Save event location"}</button></div>
      </form>

      {sites.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="bg-surface-alt text-[11.5px] font-bold uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Point</th>
                <th className="px-3 py-2">Set by</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-3 py-2 font-semibold text-text">{s.locationText}</td>
                  <td className="px-3 py-2 text-text-secondary">{s.companyName}</td>
                  <td className="px-3 py-2">
                    <a className="font-semibold text-primary hover:underline" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps?q=${s.latitude},${s.longitude}`}>
                      {s.latitude.toFixed(5)}, {s.longitude.toFixed(5)}
                    </a>
                  </td>
                  <td className="px-3 py-2 text-text-secondary">{s.source === "admin" ? "Admin (confirmed)" : "Map search (not checked)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
