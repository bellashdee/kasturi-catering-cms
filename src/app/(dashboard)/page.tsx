import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { getDashboardData } from "@/lib/queries/dashboard";
import { formatCurrency, formatMalaysiaDate, monthToDateLabel } from "@/lib/format";
import { LiveClock } from "@/components/layout/LiveClock";
import { alertsForModules } from "@/lib/notifications/reminders";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { SectionCard, EmptyRow, StatRow } from "@/components/dashboard/SectionCard";
import { AlertsPanel } from "@/components/dashboard/AlertsPanel";
import { canAccessModule } from "@/lib/modules";
import { getPendingSubmissions } from "@/lib/catering/pending";
import { SalesAgentSubmissionsAlert } from "@/components/dashboard/SalesAgentSubmissionsAlert";
import { AutoRefresh } from "@/components/dashboard/AutoRefresh";
import { BirthdayCard } from "@/components/dashboard/BirthdayCard";
import { BulletinCard } from "@/components/dashboard/BulletinCard";
import { listBulletinPosts } from "@/lib/bulletin/queries";
import { loadBirthdayRows, upcomingBirthdays } from "@/lib/hr/birthdays";
import { todayInMalaysia } from "@/lib/format";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; denied?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, denied } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);

  const selectedCompany = companies.find((c) => targetCompanyIds.length === 1 && c.id === targetCompanyIds[0]);
  const viewLabel = selectedCompany ? selectedCompany.name : "All Companies";

  if (targetCompanyIds.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-10 text-center">
        <div className="text-lg font-bold text-text">No company access yet</div>
        <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
          Your account isn&apos;t linked to a company yet. Ask a Company Admin or
          Super Admin to grant you access from Settings &rarr; Users &amp; Roles.
        </p>
      </div>
    );
  }

  // a member limited to some modules only sees the dashboard cards and alerts of those modules
  const can = (key: Parameters<typeof canAccessModule>[1]) => canAccessModule(session.allowedModules, key);

  // everything the page needs is read at the same time (one after the other made the dashboard slow to open); the birthdays and the
  // bulletin board must never take the dashboard down, so a failure there is just an empty list
  const [data, pendingSubmissions, birthdays, bulletin] = await Promise.all([
    getDashboardData(supabase, targetCompanyIds, session.allowedModules),
    can("catering") ? getPendingSubmissions(supabase, targetCompanyIds) : Promise.resolve(null),
    loadBirthdayRows(supabase, targetCompanyIds)
      .then((rows) => upcomingBirthdays(rows, todayInMalaysia(), 7, { userId: session.userId, email: session.email }))
      .catch(() => []),
    listBulletinPosts(supabase, targetCompanyIds, { includeExpired: false, limit: 3 }).catch(() => []),
  ]);
  const companyQuery = requestedId ? `?company=${requestedId}` : "";
  const alerts = alertsForModules(data.alerts, session.allowedModules);

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh />
      {denied && (
        <div className="rounded-lg border border-warning/40 bg-warning-bg px-4 py-2.5 text-[13px] font-semibold text-warning">
          You don&apos;t have access to that module. Ask a Super Admin if you need it.
        </div>
      )}

      <div>
        <h1 className="text-[24px] font-extrabold text-text">
          <LiveClock variant="date" />
        </h1>
        <p className="mt-1 text-[14px] text-text-secondary">
          Showing figures for <b className="text-text">{viewLabel}</b> · month-to-date figures cover <b className="text-text">{monthToDateLabel()}</b>
        </p>
      </div>

      <BulletinCard posts={bulletin} companyQuery={companyQuery} />

      <BirthdayCard birthdays={birthdays} companyQuery={companyQuery} />

      {pendingSubmissions && (
        <SalesAgentSubmissionsAlert
          customerCount={pendingSubmissions.customerCount}
          quotationCount={pendingSubmissions.quotationCount}
          items={pendingSubmissions.items}
          companyQuery={companyQuery}
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {can("finance-admin") && <KpiCard icon="sales" label="Revenue (MTD)" value={formatCurrency(data.financial.revenue)} hint="From confirmed customer payments" />}
        {can("finance-admin") && <KpiCard icon="expenses" label="Expenses" value={formatCurrency(data.financial.expenses)} tone="warning" iconTone="warning" hint="Supplier payments + other expenses" />}
        {can("finance-admin") && <KpiCard icon="costing" label="Monthly Costing" value={formatCurrency(data.financial.monthlyCosting)} hint="This calendar month" />}
        {can("supplier-procurement") && <KpiCard
          icon="supplier"
          label="Supplier Outstanding"
          value={formatCurrency(data.supplierPayments.outstanding)}
          tone={data.supplierPayments.overdueCount > 0 ? "danger" : "neutral"}
          iconTone="danger"
          hint={`${data.supplierPayments.overdueCount} overdue`}
        />}
        {can("finance-admin") && <KpiCard
          icon="invoice"
          label="Customer Outstanding"
          value={formatCurrency(data.customerOutstanding.outstanding)}
          tone={data.customerOutstanding.overdueCount > 0 ? "danger" : "neutral"}
          iconTone="warning"
          hint={`${data.customerOutstanding.overdueCount} overdue`}
        />}
        {can("catering") && <KpiCard icon="calendar" label="Upcoming Events" value={String(data.cateringEvents.upcomingCount)} hint="Next 14 days" />}
        {(can("finance-admin") || can("supplier-procurement")) && <KpiCard
          icon="payments"
          label="Pending Payments"
          value={String(data.supplierPayments.openCount + data.customerOutstanding.openCount)}
          hint="Supplier + customer invoices"
        />}
        {(can("hr") || can("overtime") || can("finance-admin") || can("supplier-procurement")) && <KpiCard
          icon="approvals"
          label="Pending Approvals"
          value={String(data.approvals.pendingCount)}
          tone={data.approvals.pendingCount > 0 ? "warning" : "neutral"}
          iconTone="warning"
          hint="Needs your review"
        />}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {can("finance-admin") && <SectionCard title="Financial Overview">
          <StatRow label="Revenue (MTD)" value={formatCurrency(data.financial.revenue)} />
          <StatRow label="Expenses (MTD)" value={formatCurrency(data.financial.expenses)} />
          <StatRow label="Monthly Costing" value={formatCurrency(data.financial.monthlyCosting)} />
          <StatRow label="Petty Cash Balance" value={formatCurrency(data.financeAdmin.pettyCashBalance)} />
          <StatRow
            label="Petty Cash Pending Payment"
            value={`${data.financeAdmin.pettyCashPending.count} · ${formatCurrency(data.financeAdmin.pettyCashPending.totalAmount)}`}
          />
        </SectionCard>}

        {can("supplier-procurement") && <SectionCard title="Supplier Payments">
          <StatRow label="Outstanding" value={formatCurrency(data.supplierPayments.outstanding)} />
          <StatRow label="Overdue invoices" value={data.supplierPayments.overdueCount} />
          <StatRow label="Due today" value={data.supplierPayments.dueTodayCount} />
          <StatRow label="Due this week" value={data.supplierPayments.dueThisWeekCount} />
          <StatRow label="Upcoming" value={data.supplierPayments.upcomingCount} />
          <StatRow label="Paid this month" value={formatCurrency(data.supplierPayments.paidThisMonth)} />
        </SectionCard>}

        {data.financePayments.accessible && can("finance-admin") && (
          <SectionCard title="Finance Payments" action={<Link href="/finance/payments" className="text-[12.5px] font-semibold text-primary">Open</Link>}>
            <StatRow label="Still to be paid" value={formatCurrency(data.financePayments.unpaidTotal)} />
            <StatRow label="🔴 Overdue" value={`${data.financePayments.overdueCount} · ${formatCurrency(data.financePayments.overdueAmount)}`} />
            <StatRow label="🟠 Due today" value={`${data.financePayments.dueTodayCount} · ${formatCurrency(data.financePayments.dueTodayAmount)}`} />
            <StatRow label="🟡 Due soon" value={`${data.financePayments.dueSoonCount} · ${formatCurrency(data.financePayments.dueSoonAmount)}`} />
            <StatRow label="🟢 Paid this month" value={`${data.financePayments.paidCount} · ${formatCurrency(data.financePayments.paidAmount)}`} />
          </SectionCard>
        )}

        {can("finance-admin") && <SectionCard title="Customer Outstanding">
          <StatRow label="Outstanding" value={formatCurrency(data.customerOutstanding.outstanding)} />
          <StatRow label="Overdue invoices" value={data.customerOutstanding.overdueCount} />
        </SectionCard>}

        {can("catering") && <SectionCard title="Catering Events">
          {data.cateringEvents.upcoming.length === 0 ? (
            <EmptyRow text="No catering events in the next 14 days." />
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {data.cateringEvents.upcoming.map((e) => (
                <div key={e.id} className="flex items-center justify-between py-2 text-[13.5px]">
                  <span className="font-medium text-text">{e.event_name}</span>
                  <span className="text-text-secondary">{e.event_date}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>}

        {can("kitchen") && <SectionCard title="Kitchen Production">
          <StatRow label="Production orders in progress" value={data.kitchen.inProgressCount} />
          <StatRow label="Ingredients low on stock" value={data.lowStock.length} />
          <StatRow label="Purchase requests pending" value={data.purchaseRequests.pendingCount} />
        </SectionCard>}

        {can("driver-logistics") && <SectionCard title="Driver Deliveries">
          <StatRow label="Deliveries pending" value={data.deliveries.pendingCount} />
          <StatRow label="Available drivers" value={`${data.driverFleet.availableDrivers} / ${data.driverFleet.totalDrivers}`} />
          <StatRow label="Missing clock-in today" value={data.driverAttendance.missingClockInCount} />
          <StatRow label="Missing clock-out today" value={data.driverAttendance.missingClockOutCount} />
          {data.deliveries.upcoming.length === 0 ? (
            <EmptyRow text="No upcoming deliveries." />
          ) : (
            <div className="mt-2 flex flex-col divide-y divide-border">
              {data.deliveries.upcoming.map((d) => (
                <div key={d.id} className="flex items-center justify-between py-2 text-[13.5px]">
                  <span className="font-medium text-text">{d.catering_events?.event_name ?? d.location ?? "Delivery"}</span>
                  <span className="text-text-secondary">{formatMalaysiaDate(d.scheduled_time)}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>}

        {can("hr") && <SectionCard title="HR">
          <StatRow label="Active staff" value={data.hr.staffCount} />
          <StatRow label="Staff documents expired / expiring (30 days)" value={data.hr.expiringCertificates.length} />
          <StatRow label="Licences & agreements expired / expiring (30 days)" value={data.hr.expiringCompanyDocs.length} />
        </SectionCard>}
      </div>

      <AlertsPanel alerts={alerts} />
    </div>
  );
}
