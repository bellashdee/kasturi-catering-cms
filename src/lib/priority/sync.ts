import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { SessionContext } from "@/lib/auth";
import { todayInMalaysia } from "@/lib/format";
import { resolveCompanyScope } from "@/lib/companyScope";
import { getPriorityAccess, type PriorityAccess } from "@/lib/priority/access";
import { loadEventsNeedingDecision, loadOtherPendingApprovals, loadPayables, loadTasks, type PriorityTask } from "@/lib/priority/queries";
import type { PayableView } from "@/lib/priority/payables";
import { buildCandidates, loadReminderSettings, saveNotifications, SYNC_EVERY_MS } from "@/lib/priority/reminders";

type DB = SupabaseClient<Database>;

export type PriorityData = {
  access: PriorityAccess;
  payables: PayableView[];
  tasks: PriorityTask[];
};

/** Creates the reminders that are due for the signed-in person from data already loaded (see saveNotifications for duplicates). */
export async function syncWithData(supabase: DB, data: PriorityData, now = Date.now()) {
  const { access } = data;
  const today = todayInMalaysia(now);
  const [{ settings }, otherApprovals, events, { data: gets }] = await Promise.all([
    loadReminderSettings(supabase, access.userId),
    access.canSeePayments ? loadOtherPendingApprovals(supabase, access.adminCompanyIds) : Promise.resolve([]),
    access.canSeePayments ? loadEventsNeedingDecision(supabase, access.adminCompanyIds, today) : Promise.resolve([]),
    supabase.rpc("user_gets_payment_reminders"),
  ]);
  // the reminders about outstanding supplier payments go only to the Director of Finance, who pays the suppliers: nobody else gets them
  // (the supplier payments are left out here, so the ones already waiting for anybody else are closed by saveNotifications)
  const payables = gets === true ? data.payables : [];
  const built = buildCandidates({ today, now, userId: access.userId, isApprover: access.isApprover, payables, tasks: data.tasks, otherApprovals, events, settings });
  await saveNotifications(supabase, access.userId, built);
}

/**
 * For places that do not already have the data (the bell): loads it and syncs, at most once every few minutes per person.
 * There is no background job: reminders are produced when the person opens the system, which is when they can see them.
 */
export async function syncPriorityNotifications(supabase: DB, session: SessionContext, options: { force?: boolean } = {}) {
  const { lastSyncedAt } = await loadReminderSettings(supabase, session.userId);
  if (!options.force && lastSyncedAt && Date.now() - Date.parse(lastSyncedAt) < SYNC_EVERY_MS) return;
  const { data: companies } = await supabase.from("companies").select("id");
  const { accessibleIds } = resolveCompanyScope(session, companies ?? [], undefined);
  const access = await getPriorityAccess(supabase, session, accessibleIds);
  const [payables, tasks] = await Promise.all([
    access.canSeePayments ? loadPayables(supabase, access.adminCompanyIds, todayInMalaysia()) : Promise.resolve([]),
    loadTasks(supabase, accessibleIds),
  ]);
  await syncWithData(supabase, { access, payables, tasks });
}
