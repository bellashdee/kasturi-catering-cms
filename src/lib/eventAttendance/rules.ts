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

export type StaffType = "driver" | "ia_mystaff";

export const STAFF_TYPE_LABEL: Record<StaffType, string> = {
  driver: "Driver (food delivery)",
  ia_mystaff: "Part-time staff (IA MyStaff)",
};

export type LatLng = { latitude: number; longitude: number };

export function distanceMetres(a: LatLng, b: LatLng): number {
  return haversineKm(a, b) * 1000;
}

/** "Dewan  Seri-Kasturi, JB" and "dewan seri kasturi jb" are the same place: used to find a location that was looked up before. */
export function locationKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Name in capital letters, single spaces. Only letters and the usual name marks are allowed (BIN, A/L, @, ', -, .). */
export function cleanFullName(input: string): string {
  return input.toUpperCase().replace(/\s+/g, " ").trim();
}

export function validateFullName(name: string): string | null {
  if (name.length < 3) return "Write your full name in capital letters.";
  if (name.length > 120) return "The name is too long.";
  if (!/^[A-Z][A-Z .'/@-]*$/.test(name)) return "Write the full name in capital letters (letters only, as in your IC).";
  return null;
}

/** Digits typed (with or without dashes) → "xxxxxx-xx-xxxx". */
export function formatIc(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 12);
  if (d.length <= 6) return d;
  if (d.length <= 8) return `${d.slice(0, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 6)}-${d.slice(6, 8)}-${d.slice(8)}`;
}

/** A Malaysian IC number: 12 digits whose first six are a real birth date (YYMMDD). */
export function validateIc(ic: string): string | null {
  if (!/^\d{6}-\d{2}-\d{4}$/.test(ic)) return "Write the IC number as xxxxxx-xx-xxxx (12 digits).";
  const month = Number(ic.slice(2, 4));
  const day = Number(ic.slice(4, 6));
  if (month < 1 || month > 12 || day < 1 || day > 31) return "This IC number is not valid: check the first six digits (birth date).";
  return null;
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
