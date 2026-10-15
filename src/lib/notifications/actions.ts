"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { getDashboardData } from "@/lib/queries/dashboard";
import { todayInMalaysia } from "@/lib/format";
import { buildReminders, type Reminder } from "@/lib/notifications/reminders";
import { canAccessModule } from "@/lib/modules";

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
    const items = buildReminders(data, session.allowedModules, todayInMalaysia());
    // customer payment proofs sent by sales agents that nobody has reviewed yet
    if (canAccessModule(session.allowedModules, "finance-admin")) {
      const { count } = await supabase.from("payment_proof_submissions").select("id", { count: "exact", head: true }).in("company_id", targetCompanyIds).eq("status", "pending");
      if (count && count > 0) items.unshift({ severity: "warning", title: `Payment proofs waiting for review: ${count}`, meta: "Admin & Finance · Payment Proofs", href: "/finance/payment-proofs" });
    }
    return { ok: true, items };
  } catch {
    return { ok: false, error: "Could not load reminders. Try again." };
  }
}
