"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { getDashboardData } from "@/lib/queries/dashboard";
import { todayInMalaysia } from "@/lib/format";
import { buildReminders, type Reminder } from "@/lib/notifications/reminders";
import { canAccessModule } from "@/lib/modules";
import { syncPriorityNotifications } from "@/lib/priority/sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { changeFieldByKey } from "@/lib/hr/changeFields";

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
    let items = buildReminders(data, session.allowedModules, todayInMalaysia());
    // outstanding supplier payments (and the Finance payments) are for the Director of Finance only: she pays the suppliers
    const { data: getsPaymentReminders } = await supabase.rpc("user_gets_payment_reminders");
    if (getsPaymentReminders !== true) items = items.filter((i) => !/supplier (invoice|payment)|Finance payment/i.test(i.title));
    // customer payment proofs sent by sales agents that nobody has reviewed yet
    if (canAccessModule(session.allowedModules, "finance-admin")) {
      const { count } = await supabase.from("payment_proof_submissions").select("id", { count: "exact", head: true }).in("company_id", targetCompanyIds).eq("status", "pending");
      if (count && count > 0) items.unshift({ severity: "warning", title: `Payment proofs waiting for review: ${count}`, meta: "Admin & Finance · Payment Proofs", href: "/finance/payment-proofs" });
    }
    // staff change requests: waiting for Madam Penny or Nabilah; and the answers the person got in the last 3 days
    try {
      const admin = createAdminClient();
      const { data: isSuper } = await supabase.rpc("current_user_is_super_admin");
      if (isSuper === true) {
        const { count } = await admin.from("employee_change_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
        if (count && count > 0) items.unshift({ severity: "warning", title: `Staff change requests waiting for approval: ${count}`, meta: "HR · Staff change requests", href: "/hr#change-requests" });
      }
      const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
      const { data: answered } = await admin.from("employee_change_requests").select("id, field, status").eq("requested_by", session.userId).neq("status", "pending").gte("decided_at", since);
      for (const a of answered ?? []) items.unshift({ severity: a.status === "approved" ? "info" : "warning", title: `Your request to change ${changeFieldByKey(a.field)?.label ?? a.field} was ${a.status}`, meta: "My Profile · Request a change", href: "/profile" });
    } catch {
      /* the bell still works without these lines */
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
    return { ok: true, items };
  } catch {
    return { ok: false, error: "Could not load reminders. Try again." };
  }
}
