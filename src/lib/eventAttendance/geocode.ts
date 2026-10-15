import type { LatLng } from "@/lib/eventAttendance/rules";

type Hit = { lat: string; lon: string };

async function search(query: string): Promise<LatLng | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=my&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "KasturiCateringCMS/1.0 (event attendance)", "Accept-Language": "en" }, cache: "no-store" });
    if (!res.ok) return null;
    const hits = (await res.json()) as Hit[];
    const hit = hits[0];
    if (!hit) return null;
    const latitude = Number(hit.lat);
    const longitude = Number(hit.lon);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Finds a Malaysian place on the map from the text typed as the event location (OpenStreetMap). Tries the whole text, then
 * the last parts of it (street, town, state). Returns null when nothing is found: the caller must then NOT pretend to know where it is.
 */
export async function geocodeMalaysia(text: string): Promise<LatLng | null> {
  const whole = text.trim();
  if (!whole) return null;
  const first = await search(whole);
  if (first) return first;
  const parts = whole.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length > 2) return search(parts.slice(-3).join(", "));
  return null;
}
