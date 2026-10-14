"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { getDashboardData } from "@/lib/queries/dashboard";
import { todayInMalaysia } from "@/lib/format";
import { buildReminders, type Reminder } from "@/lib/notifications/reminders";

export type RemindersResult = { ok: true; items: Reminder[] } | { ok: false; error: string };

/** The bell's reminders for the company currently being viewed (checked against the signed-in person's access on the server). */
export async function getReminders(companyId: string | null): Promise<RemindersResult> {
  try {
    const session = await getSessionContext();
    if (!session) return { ok: false, error: "Not signed in." };
    const supabase = await createClient();
    const { data: companies } = await supabase.from("companies").select("id");
    const { targetCompanyIds } = resolveCompanyScope(session, companies ?? [], companyId ?? undefined);
    if (targetCompanyIds.length === 0) return { ok: true, items: [] };
    const data = await getDashboardData(supabase, targetCompanyIds, session.allowedModules);
    return { ok: true, items: buildReminders(data, session.allowedModules, todayInMalaysia()) };
  } catch {
    return { ok: false, error: "Could not load reminders. Try again." };
  }
}
