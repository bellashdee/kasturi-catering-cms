import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { untyped } from "@/lib/kitchenPurchase/shared";
import { DriverLogisticsSubNav } from "@/components/driver/DriverLogisticsSubNav";
import { RosterScreen, rosterToday } from "@/components/opsRoster/RosterScreen";
import type { RosterViewKey } from "@/components/opsRoster/RosterNav";

const VIEWS: RosterViewKey[] = ["day", "week", "ot", "history", "staff"];

/**
 * Operation Management → Daily Duty Roster ("JADUAL DRIVER & OPERATION"): Redza and the Super Admins create and change the roster of
 * each day; everyone else with Operation Management sees it.
 */
export default async function OpsDutyRosterPage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string; period?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const supabase = await createClient();
  const sp = await searchParams;
  const { data: canEdit } = await untyped(supabase).rpc("user_can_edit_ops_roster");
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : rosterToday();
  let view = (VIEWS as string[]).includes(sp.view ?? "") ? (sp.view as RosterViewKey) : "day";
  if (view === "staff" && canEdit !== true) view = "day";
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Operation Management</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          Daily Duty Roster · drivers and operation staff{canEdit === true ? "" : " · view only (Redza and the Super Admins change it)"}
        </p>
      </div>
      <DriverLogisticsSubNav />
      <RosterScreen basePath="/driver-logistics/duty-roster" date={date} view={view} period={sp.period === "week" ? "week" : "month"} canEdit={canEdit === true} myUserId={session.userId} />
    </div>
  );
}
