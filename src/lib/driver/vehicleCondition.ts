/** Vehicle condition & maintenance records, kept once per plate number (shared by every company's record of the same van). */

export type ScheduleItem = {
  item: string;
  /** every … km (null = not by distance) */
  interval_km: number | null;
  /** every … months (null = not by time) */
  interval_months: number | null;
  last_done_date: string | null;
  last_done_km: number | null;
  notes: string | null;
};

export type TyreRow = { position: string; brand: string | null; size: string | null; purchase_date: string | null; odometer_km: number | null; notes: string | null };
export type BatteryInfo = { brand?: string | null; purchase_date?: string | null; voltage?: string | null; warranty?: string | null; replacement_date?: string | null; notes?: string | null };

export type VehicleProfile = {
  plate_number: string;
  make: string | null;
  model: string | null;
  year: number | null;
  colour: string | null;
  nickname: string | null;
  chassis_no: string | null;
  engine_no: string | null;
  fuel_type: string | null;
  odometer_km: number | null;
  odometer_date: string | null;
  insurance_company: string | null;
  policy_number: string | null;
  schedule: ScheduleItem[];
  tyres: TyreRow[];
  battery: BatteryInfo;
  annual_checklist: Record<string, string>;
  notes: string | null;
  updated_at: string | null;
};

export type FuelLog = { id: string; fill_date: string; odometer_km: number | null; litres: number | null; cost: number | null; station: string | null; notes: string | null };

export const FUEL_TYPES: Record<string, string> = { petrol: "Petrol", diesel: "Diesel", electric: "Electric", hybrid: "Hybrid" };

/** The usual service items of a van, with common intervals (a starting point: change them to the workshop's advice). */
export const DEFAULT_SCHEDULE: ScheduleItem[] = (
  [
    ["Engine oil change", 10000, 6],
    ["Oil filter", 10000, 6],
    ["Air filter", 20000, 12],
    ["Aircond (cabin) filter", 20000, 12],
    ["Tyre rotation", 10000, null],
    ["Wheel alignment & balancing", 20000, 12],
    ["Brake inspection", 10000, 6],
    ["Brake pads / discs", 40000, null],
    ["Battery check / replace", null, 6],
    ["Spark plugs", 40000, 24],
    ["Gearbox / transmission oil", 40000, 24],
    ["Coolant (radiator) flush", 40000, 24],
    ["Power steering fluid", 40000, 24],
    ["Brake fluid", 40000, 24],
    ["Differential oil", 40000, 24],
    ["Belts & hoses", 40000, 24],
    ["Wiper blades", null, 12],
    ["Lights check", null, 1],
    ["Aircond service", null, 12],
    ["PUSPAKOM inspection", null, 12],
  ] as [string, number | null, number | null][]
).map(([item, interval_km, interval_months]) => ({ item, interval_km, interval_months, last_done_date: null, last_done_km: null, notes: null }));

export const TYRE_POSITIONS = ["Front left", "Front right", "Rear left", "Rear right", "Spare"];

/** The yearly checks (ticked with the date they were last done). */
export const ANNUAL_CHECKS: [string, string][] = [
  ["fluids", "Check fluids (engine oil, coolant, brake, power steering)"],
  ["tyres", "Check tyres (pressure & tread)"],
  ["brakes", "Check brakes"],
  ["battery", "Check battery"],
  ["belts", "Check belts & hoses"],
  ["lights", "Check lights (headlights, brake lights, signals)"],
  ["wipers", "Check wiper blades"],
  ["aircond", "Check aircond"],
  ["leaks", "Wash and inspect for leaks"],
  ["documents", "Check road tax, insurance & PUSPAKOM"],
  ["fire_extinguisher", "Check fire extinguisher & first-aid kit"],
  ["cleanliness", "Check the food compartment is clean (catering van)"],
];

const addMonths = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export type DueState = "ok" | "soon" | "overdue" | "unknown";

/** When a service item is next due (by date and / or km) and whether it is OK, due soon (30 days / 1,000 km) or overdue. */
export function nextDue(s: ScheduleItem, odometer: number | null, today: string): { date: string | null; km: number | null; state: DueState } {
  const date = s.last_done_date && s.interval_months ? addMonths(s.last_done_date, s.interval_months) : null;
  const km = s.last_done_km !== null && s.interval_km ? s.last_done_km + s.interval_km : null;
  if (!date && km === null) return { date, km, state: "unknown" };
  const overdue = (date !== null && date < today) || (km !== null && odometer !== null && odometer >= km);
  const soon = (date !== null && date <= addDays(today, 30)) || (km !== null && odometer !== null && odometer >= km - 1000);
  return { date, km, state: overdue ? "overdue" : soon ? "soon" : "ok" };
}

/** A profile with the defaults filled in (a van seen for the first time). */
export function withDefaults(plate: string, p: Partial<VehicleProfile> | null): VehicleProfile {
  return {
    plate_number: plate,
    make: p?.make ?? null,
    model: p?.model ?? null,
    year: p?.year ?? null,
    colour: p?.colour ?? null,
    nickname: p?.nickname ?? null,
    chassis_no: p?.chassis_no ?? null,
    engine_no: p?.engine_no ?? null,
    fuel_type: p?.fuel_type ?? null,
    odometer_km: p?.odometer_km ?? null,
    odometer_date: p?.odometer_date ?? null,
    insurance_company: p?.insurance_company ?? null,
    policy_number: p?.policy_number ?? null,
    schedule: p?.schedule && p.schedule.length > 0 ? p.schedule : DEFAULT_SCHEDULE,
    tyres: TYRE_POSITIONS.map((position) => p?.tyres?.find((t) => t.position === position) ?? { position, brand: null, size: null, purchase_date: null, odometer_km: null, notes: null }),
    battery: p?.battery ?? {},
    annual_checklist: p?.annual_checklist ?? {},
    notes: p?.notes ?? null,
    updated_at: p?.updated_at ?? null,
  };
}
