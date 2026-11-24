import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getOwnEmployee } from "@/lib/hr/ownRecord";
import { untyped } from "@/lib/kitchenPurchase/shared";
import { todayInMalaysia } from "@/lib/format";
import type { MileageTrip } from "@/lib/hr/mileage";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { ProfileTabs } from "@/components/hr/ProfileTabs";
import { MileageLogBoard } from "@/components/hr/MileageLogBoard";

const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** My Profile → Mileage Claim: the staff member's monthly Mileage Log (trips with the odometer readings), printable as the mileage log form. */
export default async function MyMileagePage({ searchParams }: { searchParams: Promise<{ record?: string; month?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const { record, month: monthParam } = await searchParams;
  const supabase = await createClient();
  const { records, employee } = await getOwnEmployee(supabase, session.userId, record);
  const head = (
    <>
      <div className="text-[20px] font-extrabold text-text">My Profile</div>
      <ProfileTabs active="/profile/mileage" record={record} />
    </>
  );
  if (!employee) {
    return (
      <div className="flex flex-col gap-5">
        {head}
        <EmptyRow text="Your staff record is not linked to your login yet. Please ask the HR admin to link it." />
      </div>
    );
  }

  const today = todayInMalaysia();
  const month = monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) ? monthParam : today.slice(0, 7);
  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const db = untyped(supabase);
  const [{ data: trips }, { data: note }] = await Promise.all([
    db.from("mileage_logs").select("id, trip_date, from_place, to_place, purpose, start_km, end_km, total_km, purpose_code").eq("employee_id", employee.id).gte("trip_date", `${month}-01`).lt("trip_date", `${shiftMonth(month, 1)}-01`).order("trip_date").order("start_km"),
    db.from("mileage_log_months").select("notes").eq("employee_id", employee.id).eq("month", `${month}-01`).maybeSingle(),
  ]);
  const rec = record ? `&record=${record}` : "";
  const href = (m: string) => `/profile/mileage?month=${m}${rec}`;

  return (
    <div className="flex flex-col gap-5">
      {head}
      {records.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-semibold text-text-secondary">Staff record</span>
          {records.map((r) => (
            <Link key={r.id} href={`/profile/mileage?record=${r.id}&month=${month}`} className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${r.id === employee.id ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text"}`}>
              {r.companies?.name ?? r.full_name}
            </Link>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="text-[18px] font-extrabold text-text">Mileage Log</div>
          <div className="text-[13px] text-text-secondary">{employee.full_name} · {employee.companies?.name}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link href={href(shiftMonth(month, -1))} className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13.5px] font-semibold text-text" aria-label="Previous month">‹</Link>
          <div className="min-w-32 text-center text-[14px] font-semibold text-text">{monthLabel}</div>
          <Link href={href(shiftMonth(month, 1))} className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13.5px] font-semibold text-text" aria-label="Next month">›</Link>
        </div>
      </div>
      <MileageLogBoard
        key={`${employee.id}-${month}`}
        employeeId={employee.id}
        staffName={employee.full_name}
        companyName={employee.companies?.name ?? ""}
        month={month}
        monthLabel={monthLabel}
        today={today}
        trips={(trips ?? []) as MileageTrip[]}
        initialNotes={(note as { notes: string | null } | null)?.notes ?? ""}
      />
    </div>
  );
}
