import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getOwnEmployee } from "@/lib/hr/ownRecord";
import { untyped } from "@/lib/kitchenPurchase/shared";
import { formatMalaysiaDate, todayInMalaysia } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionCard, EmptyRow } from "@/components/dashboard/SectionCard";
import { ProfileTabs } from "@/components/hr/ProfileTabs";
import { ClaimHoursForm, DeleteClaimButton } from "@/components/hr/ClaimHoursControls";

type Claim = { id: string; work_date: string; start_time: string; end_time: string; hours: number; approved_hours: number | null; reason: string; status: string; manager_remarks: string | null };
const TONE: Record<string, "warning" | "success" | "danger"> = { pending: "warning", approved: "success", rejected: "danger" };
const n = (v: number) => (Number.isInteger(v) ? String(v) : Number(v).toFixed(2).replace(/\.?0+$/, ""));

/**
 * My Profile → Claim Hours. Staff with a salary of RM4,000 and above cannot claim OT; when they work extra hours they claim the hours here.
 * Once approved, every 8 hours gives 1 day of Replacement Leave (Cuti Gantian), applied for in the leave form as usual.
 */
export default async function MyClaimHoursPage({ searchParams }: { searchParams: Promise<{ record?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const { record } = await searchParams;
  const supabase = await createClient();
  const { records, employee } = await getOwnEmployee(supabase, session.userId, record);

  const head = (
    <>
      <div className="text-[20px] font-extrabold text-text">My Profile</div>
      <ProfileTabs active="/profile/claim-hours" record={record} />
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

  const db = untyped(supabase);
  const [{ data: eligible }, { data: bal }, { data: claims }] = await Promise.all([
    db.rpc("employee_uses_claim_hours", { target_employee_id: employee.id }),
    db.rpc("claim_hours_balance", { target_employee_id: employee.id }),
    db.from("claim_hours").select("id, work_date, start_time, end_time, hours, approved_hours, reason, status, manager_remarks").eq("employee_id", employee.id).order("work_date", { ascending: false }).limit(200),
  ]);
  const b = (bal as { approved_hours: number; earned_days: number; used_days: number; balance_days: number; hours_to_next_day: number }[] | null)?.[0];
  const list = (claims ?? []) as Claim[];
  const pendingHours = list.filter((c) => c.status === "pending").reduce((t, c) => t + Number(c.hours), 0);

  return (
    <div className="flex flex-col gap-5">
      {head}
      {records.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-semibold text-text-secondary">Staff record</span>
          {records.map((r) => (
            <Link key={r.id} href={`/profile/claim-hours?record=${r.id}`} className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${r.id === employee.id ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text"}`}>
              {r.companies?.name ?? r.full_name}
            </Link>
          ))}
        </div>
      )}

      <div className="rounded-xl bg-surface-alt px-4 py-3 text-[13px] leading-relaxed text-text-secondary">
        <b className="text-text">Rule:</b> staff with a salary of <b className="text-text">RM4,000 and above cannot claim OT</b>. If you work extra hours, claim the hours here.
        When your approved claim hours reach <b className="text-text">8 hours, you get 1 day of Replacement Leave</b> (Cuti Gantian) — apply for it in the leave form with the type &quot;Replacement Leave&quot;.
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Approved hours", value: n(Number(b?.approved_hours ?? 0)), sub: pendingHours ? `${n(pendingHours)} hrs waiting approval` : "all time" },
          { label: "Leave days earned", value: n(Number(b?.earned_days ?? 0)), sub: "every 8 hours = 1 day" },
          { label: "Taken / applied", value: n(Number(b?.used_days ?? 0)), sub: "replacement leave days" },
          { label: "Days available", value: n(Number(b?.balance_days ?? 0)), sub: `${n(Number(b?.hours_to_next_day ?? 8))} more hours to the next day` },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <div className="text-[12px] font-bold uppercase tracking-wide text-text-muted">{c.label}</div>
            <div className="mt-1.5 text-[26px] font-extrabold leading-none text-text">{c.value}</div>
            <div className="mt-2 text-[12.5px] text-text-secondary">{c.sub}</div>
          </div>
        ))}
      </div>

      <SectionCard title="Claim extra hours">
        {eligible === true ? (
          <ClaimHoursForm employeeId={employee.id} today={todayInMalaysia()} />
        ) : (
          <EmptyRow text="Claim Hours is only for staff with a salary of RM4,000 and above. Your extra hours are claimed as OT (OT Form). If your salary is RM4,000 and above, ask Finance to enter your payslip first." />
        )}
      </SectionCard>

      <SectionCard title="My claims">
        {list.length === 0 ? (
          <EmptyRow text="No claim hours yet." />
        ) : (
          <div className="-mx-5 -mb-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13.5px]">
              <thead>
                <tr className="border-b border-border bg-surface-alt text-left text-[12px] font-bold uppercase tracking-wide text-text-secondary">
                  <th className="px-5 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Time</th>
                  <th className="px-3 py-2.5 text-right">Hours</th>
                  <th className="px-3 py-2.5">Work</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((c) => (
                  <tr key={c.id}>
                    <td className="px-5 py-2.5 font-semibold text-text">{formatMalaysiaDate(c.work_date)}</td>
                    <td className="px-3 py-2.5 text-text-secondary">{c.start_time.slice(0, 5)} – {c.end_time.slice(0, 5)}</td>
                    <td className="px-3 py-2.5 text-right font-bold tabular-nums">
                      {c.approved_hours !== null && Number(c.approved_hours) !== Number(c.hours) ? (
                        <>{n(Number(c.approved_hours))} <span className="font-normal text-text-muted line-through">{n(Number(c.hours))}</span></>
                      ) : (
                        n(Number(c.hours))
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-text-secondary">
                      {c.reason}
                      {c.manager_remarks && <div className="text-[12px] text-text-muted">Manager: {c.manager_remarks}</div>}
                    </td>
                    <td className="px-3 py-2.5"><StatusBadge tone={TONE[c.status] ?? "neutral"}>{c.status === "pending" ? "Waiting approval" : c.status === "approved" ? "Approved" : "Rejected"}</StatusBadge></td>
                    <td className="px-5 py-2.5 text-right">{c.status !== "approved" && <DeleteClaimButton id={c.id} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
