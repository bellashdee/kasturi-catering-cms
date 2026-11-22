"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { getDashboardData } from "@/lib/queries/dashboard";
import { todayInMalaysia } from "@/lib/format";
import { buildReminders, type Reminder } from "@/lib/notifications/reminders";
import { canAccessModule } from "@/lib/modules";
import { syncPriorityNotifications } from "@/lib/priority/sync";
import { isRestaurantScope, restaurantRedirect } from "@/lib/restaurantView";

export type RemindersResult = { ok: true; items: Reminder[] } | { ok: false; error: string };

/** The bell's reminders for the company currently being viewed (checked against the signed-in person's access on the server). */
export async function getReminders(companyId: string | null): Promise<RemindersResult> {
  try {
    const session = await getSessionContext();
    if (!session) return { ok: false, error: "Not signed in." };
    const supabase = await createClient();
    const { data: companies } = await supabase.from("companies").select("id, name");
    const { targetCompanyIds } = resolveCompanyScope(session, companies ?? [], companyId ?? undefined);
    if (targetCompanyIds.length === 0) return { ok: true, items: [] };
    const data = await getDashboardData(supabase, targetCompanyIds, session.allowedModules);
    let items = buildReminders(data, session.allowedModules, todayInMalaysia());
    // outstanding supplier payments (and the Finance payments) are for the Director of Finance only: she pays the suppliers
    const { data: getsPaymentReminders } = await supabase.rpc("user_gets_payment_reminders");
    if (getsPaymentReminders !== true) items = items.filter((i) => !/supplier (invoice|payment)|Finance payment/i.test(i.title));
    // customer payment proofs sent by sales agents that nobody has reviewed yet
    if (canAccessModule(session.allowedModules, "finance-admin")) {
      const { count } = await supabase.from("payment_proof_submissions").select("id", { count: "exact", head: true }).in("company_id", targetCompanyIds).eq("status", "pending");
      if (count && count > 0) items.unshift({ severity: "warning", title: `Payment proofs waiting for review: ${count}`, meta: "Admin & Finance · Payment Proofs", href: "/finance/payment-proofs" });
    }
    // reminders of Madam Penny's Priority Centre (tasks, supplier payments, approvals): created when due, shown until read
    try {
      await syncPriorityNotifications(supabase, session);
      const { data: notes } = await supabase.from("priority_notifications").select("id, severity, title, body, href, created_at").eq("user_id", session.userId).is("read_at", null).order("created_at", { ascending: false }).limit(30);
      const rank = { danger: 0, warning: 1, info: 2 } as const;
      const mine: Reminder[] = (notes ?? [])
        .map((n) => ({ severity: n.severity as Reminder["severity"], title: n.title, meta: n.body ? `Priority Centre · ${n.body}` : "Priority Centre", href: n.href ?? "/priority-centre" }))
        .sort((a, b) => rank[a.severity] - rank[b.severity]);
      items.unshift(...mine);
    } catch (err) {
      console.warn("Priority Centre reminders could not be loaded:", err instanceof Error ? err.message : err);
    }
    // O2 Life is the restaurant: no reminder that opens a catering or Operation Management page (events, deliveries, vehicles, drivers)
    if (isRestaurantScope(companies ?? [], targetCompanyIds)) items = items.filter((i) => restaurantRedirect((i.href ?? "").split("?")[0]) === null);
    return { ok: true, items };
  } catch {
    return { ok: false, error: "Could not load reminders. Try again." };
  }
}
