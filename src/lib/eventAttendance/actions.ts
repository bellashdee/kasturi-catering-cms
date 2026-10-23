"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayInMalaysia } from "@/lib/format";
import { geocodeMalaysia } from "@/lib/eventAttendance/geocode";
import {
  EVENT_CLOCK_COMPANIES,
  EVENT_RADIUS_M,
  MAX_GPS_ACCURACY_M,
  checkRadius,
  locationKey,
  type LatLng,
  type StaffType,
} from "@/lib/eventAttendance/rules";

export type EventClockInput = {
  action: "in" | "out";
  staffType: StaffType;
  /** driver_profiles.id (drivers only). */
  driverProfileId?: string;
  eventLocation: string;
  latitude: number;
  longitude: number;
  /** Accuracy of the phone's location in metres. */
  accuracy?: number;
  /** Honeypot: real people leave it empty. */
  website?: string;
};

export type EventClockResult = { ok: true; message: string; verified: boolean; distanceM: number | null } | { ok: false; error: string };

/** At most this many clock-ins and clock-outs per company per hour (stops a bot flooding the records). */
const HOURLY_LIMIT = 300;

const clip = (s: string | undefined, max: number, missing: string, tooLong: string) => {
  const v = (s ?? "").replace(/\s+/g, " ").trim();
  if (!v) throw new Error(missing);
  if (v.length > max) throw new Error(tooLong);
  return v;
};

type Admin = ReturnType<typeof createAdminClient>;

/** Where the event location is on the map: a location used before keeps its pin; a new one is looked up once and saved. */
async function resolveSite(admin: Admin, companyId: string, location: string) {
  const key = locationKey(location);
  const { data: known } = await admin.from("event_sites").select("id, latitude, longitude").eq("company_id", companyId).eq("location_key", key).maybeSingle();
  if (known) return { id: known.id, point: { latitude: known.latitude, longitude: known.longitude } as LatLng };
  const found = await geocodeMalaysia(location);
  if (!found) return null;
  const { data: saved } = await admin
    .from("event_sites")
    .upsert({ company_id: companyId, location_key: key, location_text: location, latitude: found.latitude, longitude: found.longitude, source: "geocoded" }, { onConflict: "company_id,location_key", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  if (saved) return { id: saved.id, point: found };
  const { data: again } = await admin.from("event_sites").select("id, latitude, longitude").eq("company_id", companyId).eq("location_key", key).maybeSingle();
  return again ? { id: again.id, point: { latitude: again.latitude, longitude: again.longitude } as LatLng } : { id: null, point: found };
}

function tooFar(distanceM: number, what: "in" | "out") {
  const metres = Math.round(distanceM);
  return new Error(
    what === "in"
      ? `You are about ${metres} m from the event location. You must be within ${EVENT_RADIUS_M} m to clock in. If you are at the event, tell the office so the location can be corrected.`
      : `You are about ${metres} m from the event location. You must be within ${EVENT_RADIUS_M} m to clock out. If you are at the event, tell the office so the location can be corrected.`,
  );
}

/**
 * Public (no login): a member of staff on duty at an event (a driver) clocks in or out of the event. The company comes from the link. The phone
 * must be within 100 m of the event location: the distance is worked out here, from the location the phone sent. A location that
 * cannot be found on the map is recorded as "not verified" for the office to check instead of locking the person out.
 */
export async function submitEventClock(companySlug: string, input: EventClockInput): Promise<EventClockResult> {
  try {
    const company = EVENT_CLOCK_COMPANIES[companySlug];
    if (!company) throw new Error("This link is not valid.");
    if (input.website?.trim()) return { ok: true, message: "Saved.", verified: true, distanceM: null }; // a bot filled the hidden field
    if (input.action !== "in" && input.action !== "out") throw new Error("Choose Clock In or Clock Out.");
    if (input.staffType !== "driver") throw new Error("Only the staff on duty at an event can clock in here.");
    if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude) || Math.abs(input.latitude) > 90 || Math.abs(input.longitude) > 180) throw new Error("Your location could not be read. Allow location access and try again.");
    if (input.accuracy !== undefined && input.accuracy > MAX_GPS_ACCURACY_M) {
      throw new Error(`Your phone's location is not exact enough (about ${Math.round(input.accuracy)} m). Go outdoors, switch on high-accuracy location and try again.`);
    }
    const eventLocation = clip(input.eventLocation, 300, "Write the event location.", "The event location is too long.");

    const admin = createAdminClient();

    // who is clocking: a member of staff chosen from the company's list (the name comes from the staff record, never typed)
    if (!input.driverProfileId) throw new Error("Select your name from the staff list.");
    const { data: driver } = await admin.from("driver_profiles").select("id, company_id, employees(full_name, status)").eq("id", input.driverProfileId).maybeSingle();
    if (!driver || driver.company_id !== company.id || driver.employees?.status !== "active") throw new Error("Select your name from the staff list.");
    const staffKey: string = driver.id;
    const driverProfileId: string = driver.id;
    const personName: string = driver.employees.full_name;
    const ic: string | null = null;

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin.from("event_attendance").select("id", { count: "exact", head: true }).eq("company_id", company.id).gte("updated_at", since);
    if ((count ?? 0) >= HOURLY_LIMIT) throw new Error("Too many entries right now. Please try again in a while.");

    const here: LatLng = { latitude: input.latitude, longitude: input.longitude };
    const nowIso = new Date().toISOString();
    const today = todayInMalaysia();
    // the event is identified by where it is: the same person at the same place on the same day is one event
    const eventKey = locationKey(eventLocation);

    if (input.action === "in") {
      const { data: already } = await admin
        .from("event_attendance")
        .select("id, clock_in_time")
        .eq("company_id", company.id)
        .eq("staff_type", input.staffType)
        .eq("staff_key", staffKey)
        .eq("event_key", eventKey)
        .eq("attendance_date", today)
        .maybeSingle();
      if (already?.clock_in_time) throw new Error("You have already clocked in for this event today.");

      const site = await resolveSite(admin, company.id, eventLocation);
      let distanceM: number | null = null;
      if (site) {
        const check = checkRadius(here, site.point);
        distanceM = Math.round(check.distanceM * 10) / 10;
        if (!check.ok) throw tooFar(check.distanceM, "in");
      }

      // link to the event of the same name in the calendar, when there is one (yesterday to tomorrow)
      const day = (offset: number) => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
      const { data: events } = await admin.from("catering_events").select("id, event_name, location").eq("company_id", company.id).gte("event_date", day(-1)).lte("event_date", day(1));
      const matched = (events ?? []).find((e) => {
        const k = e.location ? locationKey(e.location) : "";
        return k.length > 3 && (k === eventKey || k.includes(eventKey) || eventKey.includes(k));
      });
      // no event name is typed: the name of the event in the calendar at this place, otherwise the place itself
      const eventName = (matched?.event_name ?? eventLocation).slice(0, 200);

      const { error } = await admin.from("event_attendance").insert({
        company_id: company.id,
        staff_type: input.staffType,
        staff_key: staffKey,
        driver_profile_id: driverProfileId,
        person_name: personName,
        ic_number: ic,
        event_id: matched?.id ?? null,
        event_name: eventName,
        event_key: eventKey,
        event_location: eventLocation,
        site_id: site?.id ?? null,
        attendance_date: today,
        clock_in_time: nowIso,
        clock_in_latitude: here.latitude,
        clock_in_longitude: here.longitude,
        clock_in_distance_m: distanceM,
        clock_in_check: site ? "verified" : "unverified",
      });
      if (error) {
        if (error.code === "23505") throw new Error("You have already clocked in for this event today.");
        throw new Error("Could not save. Please try again.");
      }
      revalidatePath("/driver-logistics/attendance");
      return {
        ok: true,
        verified: !!site,
        distanceM,
        message: site ? `Clocked in. You are ${Math.round(distanceM ?? 0)} m from the event location.` : "Clocked in. The event location could not be found on the map, so the office will check it.",
      };
    }

    // clock out: the open clock-in of this person (the last 24 hours, so an event that ends after midnight still works)
    const { data: open } = await admin
      .from("event_attendance")
      .select("id, event_key, event_name, site_id, clock_in_time")
      .eq("company_id", company.id)
      .eq("staff_type", input.staffType)
      .eq("staff_key", staffKey)
      .is("clock_out_time", null)
      .not("clock_in_time", "is", null)
      .gte("clock_in_time", new Date(Date.now() - 24 * 3_600_000).toISOString())
      .order("clock_in_time", { ascending: false });
    const record = (open ?? []).find((r) => r.event_key === eventKey);
    if (!record) {
      throw new Error((open ?? []).length > 0 ? `No clock-in found for "${eventLocation}". You are clocked in at: ${(open ?? []).map((r) => r.event_name).join(", ")}.` : "You have not clocked in at this location. Clock in first.");
    }

    let distanceM: number | null = null;
    let verified = false;
    if (record.site_id) {
      const { data: site } = await admin.from("event_sites").select("latitude, longitude").eq("id", record.site_id).maybeSingle();
      if (site) {
        const check = checkRadius(here, { latitude: site.latitude, longitude: site.longitude });
        distanceM = Math.round(check.distanceM * 10) / 10;
        verified = true;
        if (!check.ok) throw tooFar(check.distanceM, "out");
      }
    }
    const { data: updated, error } = await admin
      .from("event_attendance")
      .update({ clock_out_time: nowIso, clock_out_latitude: here.latitude, clock_out_longitude: here.longitude, clock_out_distance_m: distanceM, clock_out_check: verified ? "verified" : "unverified" })
      .eq("id", record.id)
      .is("clock_out_time", null)
      .select("id");
    if (error || !updated || updated.length !== 1) throw new Error("Could not save. You may already have clocked out.");
    revalidatePath("/driver-logistics/attendance");
    return {
      ok: true,
      verified,
      distanceM,
      message: verified ? `Clocked out. You are ${Math.round(distanceM ?? 0)} m from the event location.` : "Clocked out. The event location could not be checked, so the office will review it.",
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save. Please try again." };
  }
}
