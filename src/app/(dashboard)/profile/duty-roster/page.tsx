import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { untyped } from "@/lib/kitchenPurchase/shared";
import { ProfileHeader } from "@/components/hr/ProfileHeader";
import { RosterScreen, rosterToday } from "@/components/opsRoster/RosterScreen";
import type { RosterViewKey } from "@/components/opsRoster/RosterNav";

const VIEWS: RosterViewKey[] = ["day", "week", "ot", "history"];

/** My Profile → Duty Roster: the drivers and operation staff see the daily and weekly roster (their own card first). View only. */
export default async function MyDutyRosterPage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string; period?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const supabase = await createClient();
  const { data: onRoster } = await untyped(supabase).rpc("user_is_ops_roster_staff");
  const { data: canView } = await untyped(supabase).rpc("user_can_view_ops_roster");
  if (onRoster !== true && canView !== true) redirect("/profile");
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : rosterToday();
  const view = (VIEWS as string[]).includes(sp.view ?? "") ? (sp.view as RosterViewKey) : "day";
  return (
    <div className="flex flex-col gap-5">
      <ProfileHeader active="/profile/duty-roster" title="Duty Roster" intro="Your working hours and tasks for each day, and the rest of the team's. The latest update is always shown here." />
      <RosterScreen basePath="/profile/duty-roster" date={date} view={view} period={sp.period === "week" ? "week" : "month"} canEdit={false} myUserId={session.userId} />
    </div>
  );
}
