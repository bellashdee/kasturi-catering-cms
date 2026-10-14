import { MODULES } from "@/lib/constants";
import { canAccessModule } from "@/lib/modules";
import { formatMalaysiaTime, malaysiaDateOf } from "@/lib/format";
import type { Alert, getDashboardData } from "@/lib/queries/dashboard";

export type Reminder = Alert & { href?: string };

type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

/** Alerts only for the modules the person may open (an alert's `meta` starts with the label of the module it belongs to). */
export function alertsForModules(alerts: Alert[], allowedModules: string[] | null): Alert[] {
  return alerts.filter((a) => {
    const owner = MODULES.find((m) => a.meta.startsWith(m.label));
    return !owner || canAccessModule(allowedModules, owner.key);
  });
}

/**
 * The bell's list: today's events and deliveries, pending approvals, and the dashboard alerts (overdue / due invoices and
 * payments, expiring documents, low stock ...). Everything comes from real records and due dates; each line is a count
 * or a named record, so nothing can appear twice.
 */
export function buildReminders(data: DashboardData, allowedModules: string[] | null, today: string): Reminder[] {
  const out: Reminder[] = [];
  const can = (key: Parameters<typeof canAccessModule>[1]) => canAccessModule(allowedModules, key);

  if (can("catering")) {
    for (const e of data.cateringEvents.upcoming.filter((e) => e.event_date === today)) {
      out.push({ severity: "info", title: `Today: ${e.event_name}`, meta: "Catering · event today", href: `/catering/${e.id}` });
    }
  }
  if (can("driver-logistics")) {
    for (const d of data.deliveries.upcoming.filter((d) => d.scheduled_time && malaysiaDateOf(d.scheduled_time) === today)) {
      out.push({
        severity: "info",
        title: `Delivery today: ${d.catering_events?.event_name ?? d.location ?? "Delivery"}`,
        meta: `Operation Management · ${formatMalaysiaTime(d.scheduled_time)}`,
        href: `/driver-logistics/${d.id}`,
      });
    }
  }
  if (data.approvals.pendingCount > 0) {
    out.push({ severity: "warning", title: `${data.approvals.pendingCount} approval(s) waiting for review`, meta: "Pending approvals" });
  }
  out.push(...alertsForModules(data.alerts, allowedModules));

  const seen = new Set<string>();
  return out.filter((r) => (seen.has(r.title) ? false : (seen.add(r.title), true)));
}
