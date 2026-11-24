import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { leaveBalanceYears } from "@/lib/hr/leaveBalance";
import { untyped } from "@/lib/kitchenPurchase/shared";
import { todayInMalaysia } from "@/lib/format";

type LeaveLike = { leave_type: string; start_date: string; days: number | string | null; status: string };
const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** Leave balance of one staff member: AL and MC of each year (entitled, taken, waiting approval, balance), and the claim-hours replacement leave. */
export async function LeaveBalanceCard({ employeeId, joinDate, leave, supabase, claimHoursHref }: { employeeId: string; joinDate: string | null; leave: LeaveLike[]; supabase: SupabaseClient<Database>; claimHoursHref?: string }) {
  const thisYear = Number(todayInMalaysia().slice(0, 4));
  const years = leaveBalanceYears(joinDate, leave, thisYear);
  const [{ data: usesClaimHours }, { data: balanceRows }] = await Promise.all([
    untyped(supabase).rpc("employee_uses_claim_hours", { target_employee_id: employeeId }),
    untyped(supabase).rpc("claim_hours_balance", { target_employee_id: employeeId }),
  ]);
  const ch = (balanceRows as { approved_hours: number; earned_days: number; used_days: number; balance_days: number; hours_to_next_day: number }[] | null)?.[0];
  const current = years[0];

  return (
    <SectionCard noPrint title={`Leave Balance ${thisYear}`}>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Annual Leave (AL)", v: current.al },
          { label: "Medical Leave (MC)", v: current.mc },
        ].map(({ label, v }) => (
          <div key={label} className="rounded-xl bg-surface-alt p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{label}</div>
            <div className={`mt-1 text-[24px] font-extrabold leading-none ${v.balance < 0 ? "text-danger" : "text-text"}`}>
              {n(v.balance)} <span className="text-[13px] font-semibold text-text-secondary">/ {n(v.entitled)} days left</span>
            </div>
            <div className="mt-1.5 text-[12px] text-text-secondary">
              Taken {n(v.taken)}{v.waiting ? ` · waiting approval ${n(v.waiting)}` : ""}
            </div>
          </div>
        ))}
      </div>

      {(usesClaimHours === true || (ch && Number(ch.approved_hours) > 0)) && ch && (
        <div className="mt-3 rounded-xl border border-primary/30 bg-surface p-3 text-[13px]">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Replacement Leave from Claim Hours</div>
            {claimHoursHref && <Link href={claimHoursHref} className="text-[12.5px] font-semibold text-primary hover:underline">Claim Hours →</Link>}
          </div>
          <div className="mt-1 text-[20px] font-extrabold text-text">{n(Number(ch.balance_days))} day{Number(ch.balance_days) === 1 ? "" : "s"} available</div>
          <div className="text-[12px] text-text-secondary">
            {n(Number(ch.approved_hours))} approved hours = {n(Number(ch.earned_days))} day(s) earned · {n(Number(ch.used_days))} taken / waiting · {n(Number(ch.hours_to_next_day))} more hours to the next day
          </div>
        </div>
      )}

      {years.length > 1 && (
        <div className="-mx-5 -mb-5 mt-4 overflow-x-auto border-t border-border">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
                <th className="px-5 py-2">Year</th>
                <th className="px-2 py-2 text-right">AL entitled</th>
                <th className="px-2 py-2 text-right">AL taken</th>
                <th className="px-2 py-2 text-right">AL balance</th>
                <th className="px-2 py-2 text-right">MC entitled</th>
                <th className="px-2 py-2 text-right">MC taken</th>
                <th className="px-5 py-2 text-right">MC balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {years.map((y) => (
                <tr key={y.year}>
                  <td className="px-5 py-2 font-semibold text-text">{y.year}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{n(y.al.entitled)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{n(y.al.taken + y.al.waiting)}</td>
                  <td className="px-2 py-2 text-right font-bold tabular-nums">{n(y.al.balance)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{n(y.mc.entitled)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{n(y.mc.taken + y.mc.waiting)}</td>
                  <td className="px-5 py-2 text-right font-bold tabular-nums">{n(y.mc.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className={`${years.length > 1 ? "mt-7" : "mt-3"} text-[11.5px] text-text-muted`}>
        Entitlement by the Employment Act 1955 ({current.serviceYears} completed year{current.serviceYears === 1 ? "" : "s"} of service{joinDate ? "" : " — no start date on the staff record"}). The year you join, AL is in proportion to the months worked.
      </div>
    </SectionCard>
  );
}
