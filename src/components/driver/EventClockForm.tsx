"use client";

import { useEffect, useState } from "react";
import { getCurrentPosition } from "@/lib/driverAttendance/geo";
import { submitEventClock } from "@/lib/eventAttendance/actions";
import { EVENT_RADIUS_M } from "@/lib/eventAttendance/rules";

const inputClass = "mt-1.5 h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-[15px] outline-none focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass = "text-[13px] font-semibold text-text-secondary";
const STORE = "kasturi-event-clock";

type Remembered = { driverId?: string; eventName?: string; eventLocation?: string };

function readStore(): Remembered {
  try {
    return (JSON.parse(localStorage.getItem(`${STORE}:driver`) ?? "{}") as Remembered) ?? {};
  } catch {
    return {};
  }
}

function writeStore(value: Remembered) {
  try {
    localStorage.setItem(`${STORE}:driver`, JSON.stringify(value));
  } catch {
    // private window or blocked storage: the form just does not remember
  }
}

export type ClockCompany = { slug: string; name: string };
export type ClockDriver = { id: string; name: string; companySlug: string };
export type ClockSuggestion = { name: string; location: string; companySlug: string };

/**
 * The clock in / clock out form for the staff on duty at an event (the drivers). It asks the phone for its location and the
 * server checks that it is within 100 m of the event location.
 */
export function EventClockForm({
  companies,
  drivers,
  suggestions = [],
}: {
  companies: ClockCompany[];
  drivers: ClockDriver[];
  suggestions?: ClockSuggestion[];
}) {
  const [companySlug, setCompanySlug] = useState(companies[0]?.slug ?? "");
  const [action, setAction] = useState<"in" | "out">("in");
  const [driverId, setDriverId] = useState("");
  const [eventName, setEventName] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ message: string; verified: boolean } | null>(null);

  const companyDrivers = drivers.filter((d) => d.companySlug === companySlug);
  const eventHints = suggestions.filter((s) => s.companySlug === companySlug);

  // what this phone used last time (so the clock-out needs no retyping)
  useEffect(() => {
    const t = setTimeout(() => {
      const r = readStore();
      setDriverId(r.driverId ?? "");
      setEventName(r.eventName ?? "");
      setEventLocation(r.eventLocation ?? "");
    }, 0);
    return () => clearTimeout(t);
  }, []);

  function pickEvent(name: string) {
    setEventName(name);
    const hit = eventHints.find((s) => s.name.toLowerCase() === name.trim().toLowerCase());
    if (hit && !eventLocation.trim()) setEventLocation(hit.location);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    setBusy(true);
    try {
      const position = await getCurrentPosition();
      const result = await submitEventClock(companySlug, {
        action,
        staffType: "driver",
        driverProfileId: driverId,
        eventName,
        eventLocation,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        website,
      });
      if (!result.ok) throw new Error(result.error);
      writeStore({ driverId, eventName, eventLocation });
      setDone({ message: result.message, verified: result.verified });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {companies.length > 1 && (
        <div>
          <label className={labelClass} htmlFor="ec-company">Company</label>
          <select id="ec-company" className={inputClass} value={companySlug} onChange={(e) => { setCompanySlug(e.target.value); setDriverId(""); }}>
            {companies.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className={labelClass} htmlFor="ec-driver">Staff name</label>
        <select id="ec-driver" className={inputClass} value={driverId} onChange={(e) => setDriverId(e.target.value)} required>
          <option value="">Select your name</option>
          {companyDrivers.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass} htmlFor="ec-event">Event name</label>
        <input id="ec-event" className={inputClass} list="ec-events" value={eventName} onChange={(e) => pickEvent(e.target.value)} maxLength={200} required />
        <datalist id="ec-events">
          {eventHints.map((s) => (
            <option key={`${s.name}|${s.location}`} value={s.name} />
          ))}
        </datalist>
      </div>
      <div>
        <label className={labelClass} htmlFor="ec-location">Event location</label>
        <input id="ec-location" className={inputClass} value={eventLocation} onChange={(e) => setEventLocation(e.target.value)} maxLength={300} placeholder="Venue name and address" required />
      </div>

      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Clock in or clock out">
        <button type="button" aria-pressed={action === "in"} onClick={() => setAction("in")} className={`h-11 rounded-lg text-[15px] font-bold ${action === "in" ? "bg-success text-white" : "border border-border-strong bg-surface text-text-secondary"}`}>Clock In</button>
        <button type="button" aria-pressed={action === "out"} onClick={() => setAction("out")} className={`h-11 rounded-lg text-[15px] font-bold ${action === "out" ? "bg-danger text-white" : "border border-border-strong bg-surface text-text-secondary"}`}>Clock Out</button>
      </div>

      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website</label>
        <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>

      <p className="text-[13px] text-text-secondary">{`Your phone will ask for location access. You must be within ${EVENT_RADIUS_M} metres of the event location to clock in or out.`}</p>

      {error && <div role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2.5 text-[14px] font-medium text-danger">{error}</div>}
      {done && (
        <div role="status" className={`rounded-lg border px-3 py-2.5 text-[14px] font-semibold ${done.verified ? "border-success/30 bg-success-bg text-success" : "border-warning/30 bg-warning-bg text-warning"}`}>
          {done.message}
        </div>
      )}

      <button type="submit" disabled={busy} className={`h-12 rounded-lg text-[16px] font-bold text-white disabled:opacity-60 ${action === "in" ? "bg-success" : "bg-danger"}`}>
        {busy ? "Checking your location..." : action === "in" ? "Confirm Clock In" : "Confirm Clock Out"}
      </button>
    </form>
  );
}
