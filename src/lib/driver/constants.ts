export const DELIVERY_STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  in_transit: "In Transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const AVAILABILITY_LABEL: Record<string, string> = {
  available: "Available",
  on_delivery: "On Delivery",
  off_duty: "Off Duty",
  on_leave: "On Leave",
};

export const VEHICLE_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  maintenance: "In Maintenance",
  inactive: "Inactive",
  retired: "Retired",
};

export const EXPENSE_CATEGORY_LABEL: Record<string, string> = {
  mileage: "Mileage",
  fuel: "Fuel",
  toll: "Toll",
  parking: "Parking",
  other: "Other",
};

export function isExpiringSoon(date: string | null, withinDays = 30): boolean {
  if (!date) return false;
  const target = new Date(date).getTime();
  const now = Date.now();
  const window = withinDays * 24 * 60 * 60 * 1000;
  return target - now <= window;
}

export const LATE_GRACE_MINUTES = 15;

export type AttendanceStatus = "present" | "late" | "missing_clock_in" | "missing_clock_out" | "incomplete" | "off_day" | "not_clocked_in";

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "🟢 Present",
  late: "🟡 Late",
  missing_clock_in: "🔴 Missing Clock In",
  missing_clock_out: "🔴 Missing Clock Out",
  incomplete: "🟠 Incomplete",
  off_day: "⚪ Off Day",
  not_clocked_in: "⚪ Not Clocked In",
};

export const ATTENDANCE_STATUS_TONE: Record<AttendanceStatus, "success" | "warning" | "danger" | "neutral"> = {
  present: "success",
  late: "warning",
  missing_clock_in: "danger",
  missing_clock_out: "danger",
  incomplete: "warning",
  off_day: "neutral",
  not_clocked_in: "neutral",
};

type AttendanceRow = {
  attendance_date: string;
  clock_in_time: string | null;
  clock_out_time: string | null;
  is_off_day: boolean;
};

/**
 * Derived, never stored — same approach as invoice "Overdue" elsewhere in
 * this app. "Today" rows lacking a clock-out are "Incomplete" (still in
 * progress); past rows lacking one are "Missing Clock Out".
 */
export function computeAttendanceStatus(row: AttendanceRow, expectedClockInTime: string): AttendanceStatus {
  if (row.is_off_day) return "off_day";

  const isToday = row.attendance_date === new Date().toISOString().slice(0, 10);
  const isPastDay = row.attendance_date < new Date().toISOString().slice(0, 10);

  if (!row.clock_in_time && !row.clock_out_time) {
    return isPastDay ? "missing_clock_in" : "not_clocked_in";
  }
  if (!row.clock_in_time && row.clock_out_time) return "missing_clock_in";
  if (row.clock_in_time && !row.clock_out_time) {
    return isToday ? "incomplete" : "missing_clock_out";
  }

  // Both recorded — Present unless the clock-in was late.
  const clockInDate = new Date(row.clock_in_time!);
  const [expH, expM] = expectedClockInTime.split(":").map(Number);
  const expected = new Date(clockInDate);
  expected.setHours(expH, expM + LATE_GRACE_MINUTES, 0, 0);
  return clockInDate > expected ? "late" : "present";
}
