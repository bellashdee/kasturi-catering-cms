export const PURPOSE_CODES: { code: number; label: string }[] = [
  { code: 1, label: "Business" },
  { code: 2, label: "Personal / Commuting" },
  { code: 3, label: "Fuel" },
  { code: 4, label: "Maintenance" },
  { code: 5, label: "Other" },
];

export type MileageTrip = {
  id: string;
  trip_date: string;
  from_place: string;
  to_place: string;
  purpose: string | null;
  start_km: number;
  end_km: number;
  total_km: number;
  purpose_code: number;
};

/** The mileage claim rate: RM0.80 for every business kilometre. */
export const MILEAGE_RATE_RM = 0.8;

/** Business, personal and other (fuel, maintenance, other) kilometres of the month, and the claim (business km × RM0.80). */
export function mileageSummary(trips: MileageTrip[]) {
  const km = (codes: number[]) => trips.filter((t) => codes.includes(t.purpose_code)).reduce((s, t) => s + Number(t.total_km), 0);
  const business = km([1]);
  const personal = km([2]);
  const other = km([3, 4, 5]);
  return { business, personal, other, total: business + personal + other, claim: Math.round(business * MILEAGE_RATE_RM * 100) / 100 };
}
