import Link from "next/link";
import { ProfileTabs } from "@/components/hr/ProfileTabs";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/kitchenPurchase/shared";
import { isSuperiorAnywhere, myTeamRequests } from "@/lib/hr/superiors";

type Rec = { id: string; full_name: string; companies?: { name: string } | null };

/** The top of every My Profile page: the title, a line saying what the page is for, the tabs, and (for someone with a record in several companies) the record switch. */
export async function ProfileHeader({ active, record, title, intro, records, currentId }: { active: string; record?: string; title: string; intro?: string; records?: Rec[]; currentId?: string }) {
  // a superior sees the Team Approvals tab, with the number of OT and leave waiting for them
  const supabase = await createClient();
  const isSuperior = await isSuperiorAnywhere(supabase).catch(() => false);
  // the drivers and operation staff on the Daily Duty Roster see it in My Profile
  const { data: onRoster } = await untyped(supabase).rpc("user_is_ops_roster_staff");
  const team = isSuperior ? await myTeamRequests(supabase).catch(() => ({ overtime: [], leave: [] })) : { overtime: [], leave: [] };
  const teamWaiting = team.overtime.filter((o) => o.status === "submitted" || o.status === "pending_approval").length + team.leave.filter((l) => l.status === "pending").length;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-[13px] font-semibold uppercase tracking-wide text-text-muted">My Profile</div>
        <h1 className="mt-0.5 text-[24px] font-extrabold leading-tight text-text">{title}</h1>
        {intro && <p className="mt-1 max-w-3xl text-[14px] leading-relaxed text-text-secondary">{intro}</p>}
      </div>
      <ProfileTabs active={active} record={record} showTeam={isSuperior} showRoster={onRoster === true} teamWaiting={teamWaiting} />
      {records && records.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-text-secondary">Company record:</span>
          {records.map((r) => (
            <Link
              key={r.id}
              href={`${active}?record=${r.id}`}
              className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${r.id === currentId ? "border-primary bg-primary text-white" : "border-border-strong bg-surface text-text"}`}
            >
              {r.companies?.name ?? r.full_name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
