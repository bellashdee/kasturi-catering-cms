import { haversineKm } from "@/lib/driverAttendance/geo";

/** A person clocking in or out must be within this many metres of the event location. */
export const EVENT_RADIUS_M = 100;
/** A phone location that is less exact than this cannot show whether the person is within 100 m, so it is not accepted. */
export const MAX_GPS_ACCURACY_M = 100;

/** One public clock link per company (the company is fixed by the link, the browser never sends a company id). */
export const EVENT_CLOCK_COMPANIES: Record<string, { id: string; name: string }> = {
  "signature-solution": { id: "bf86ef51-fc00-4331-aef6-a0deaee07183", name: "Signature Solution Sdn Bhd" },
  "kasturi-indah": { id: "a57fb12e-e446-4ede-9e35-f7eed46058c2", name: "Kasturi Indah Sdn Bhd" },
  "o2-life": { id: "8cb94636-7cdb-4bb2-a9b3-cd280c1da3fb", name: "O2 Life Sdn Bhd" },
};

export function slugForCompany(companyId: string): string | null {
  return Object.entries(EVENT_CLOCK_COMPANIES).find(([, c]) => c.id === companyId)?.[0] ?? null;
}

/** The staff on duty at an event who clock in and out: the drivers and the foreign staff (part-timers are not part of this). */
export type StaffType = "driver" | "foreign_staff";

export type LatLng = { latitude: number; longitude: number };

export function distanceMetres(a: LatLng, b: LatLng): number {
  return haversineKm(a, b) * 1000;
}

/** "Dewan  Seri-Kasturi, JB" and "dewan seri kasturi jb" are the same place: used to find a location that was looked up before. */
export function locationKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Coordinates from "3.1390, 101.6869" or from a Google Maps link (…@3.139,101.6869…, …?q=3.139,101.6869, …!3d3.139!4d101.6869).
 * Returns null when no valid pair is found.
 */
export function parseCoordinates(text: string): LatLng | null {
  const t = text.trim();
  const patterns = [/@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/, /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/, /[?&](?:q|ll|query)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/, /^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const latitude = Number(m[1]);
      const longitude = Number(m[2]);
      if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) return { latitude, longitude };
    }
  }
  return null;
}

export type RadiusCheck = { ok: boolean; distanceM: number };

export function checkRadius(from: LatLng, site: LatLng): RadiusCheck {
  const distanceM = distanceMetres(from, site);
  return { ok: distanceM <= EVENT_RADIUS_M, distanceM };
}
