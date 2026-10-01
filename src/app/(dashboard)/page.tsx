import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { getDashboardData } from "@/lib/queries/dashboard";
import { formatCurrency } from "@/lib/format";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { SectionCard, EmptyRow, StatRow } from "@/components/dashboard/SectionCard";
import { AlertsPanel } from "@/components/dashboard/AlertsPanel";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId } = await searchParams;
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

  const data = await getDashboardData(supabase, targetCompanyIds);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">
          {new Date().toLocaleDateString("en-MY", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          Showing figures for <b>{viewLabel}</b>
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Revenue (MTD)" value={formatCurrency(data.financial.revenue)} hint="From confirmed customer payments" />
        <KpiCard label="Expenses" value={formatCurrency(data.financial.expenses)} tone="warning" iconTone="warning" hint="Supplier payments + other expenses" />
        <KpiCard label="Monthly Costing" value={formatCurrency(data.financial.monthlyCosting)} hint="This calendar month" />
        <KpiCard
          label="Supplier Outstanding"
          value={formatCurrency(data.supplierPayments.outstanding)}
          tone={data.supplierPayments.overdueCount > 0 ? "danger" : "neutral"}
          iconTone="danger"
          hint={`${data.supplierPayments.overdueCount} overdue`}
        />
        <KpiCard
          label="Customer Outstanding"
          value={formatCurrency(data.customerOutstanding.outstanding)}
          tone={data.customerOutstanding.overdueCount > 0 ? "danger" : "neutral"}
          iconTone="warning"
          hint={`${data.customerOutstanding.overdueCount} overdue`}
        />
        <KpiCard label="Upcoming Events" value={String(data.cateringEvents.upcomingCount)} hint="Next 14 days" />
        <KpiCard
          label="Pending Payments"
          value={String(data.supplierPayments.openCount + data.customerOutstanding.openCount)}
          hint="Supplier + customer invoices"
        />
        <KpiCard
          label="Pending Approvals"
          value={String(data.approvals.pendingCount)}
          tone={data.approvals.pendingCount > 0 ? "warning" : "neutral"}
          iconTone="warning"
          hint="Needs your review"
        />
      </div>

      <div className="grid grid-cols-2 gap-5">
        <SectionCard title="Financial Overview">
          <StatRow label="Revenue (MTD)" value={formatCurrency(data.financial.revenue)} />
          <StatRow label="Expenses (MTD)" value={formatCurrency(data.financial.expenses)} />
          <StatRow label="Monthly Costing" value={formatCurrency(data.financial.monthlyCosting)} />
          <StatRow label="Petty Cash Balance" value={formatCurrency(data.financeAdmin.pettyCashBalance)} />
          <StatRow
            label="Petty Cash Pending Payment"
            value={`${data.financeAdmin.pettyCashPending.count} · ${formatCurrency(data.financeAdmin.pettyCashPending.totalAmount)}`}
          />
        </SectionCard>

        <SectionCard title="Supplier Payments">
          <StatRow label="Outstanding" value={formatCurrency(data.supplierPayments.outstanding)} />
          <StatRow label="Overdue invoices" value={data.supplierPayments.overdueCount} />
          <StatRow label="Due today" value={data.supplierPayments.dueTodayCount} />
          <StatRow label="Due this week" value={data.supplierPayments.dueThisWeekCount} />
          <StatRow label="Upcoming" value={data.supplierPayments.upcomingCount} />
          <StatRow label="Paid this month" value={formatCurrency(data.supplierPayments.paidThisMonth)} />
        </SectionCard>

        <SectionCard title="Customer Outstanding">
          <StatRow label="Outstanding" value={formatCurrency(data.customerOutstanding.outstanding)} />
          <StatRow label="Overdue invoices" value={data.customerOutstanding.overdueCount} />
        </SectionCard>

        <SectionCard title="Catering Events">
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
        </SectionCard>

        <SectionCard title="Kitchen Production">
          <StatRow label="Production orders in progress" value={data.kitchen.inProgressCount} />
          <StatRow label="Ingredients low on stock" value={data.lowStock.length} />
          <StatRow label="Purchase requests pending" value={data.purchaseRequests.pendingCount} />
        </SectionCard>

        <SectionCard title="Driver Deliveries">
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
                  <span className="text-text-secondary">{d.scheduled_time ? new Date(d.scheduled_time).toLocaleDateString("en-MY") : "—"}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="HR">
          <StatRow label="Active staff" value={data.hr.staffCount} />
          <StatRow label="Certificates expiring (30 days)" value={data.hr.expiringCertificates.length} />
        </SectionCard>

        <SectionCard title="Marketing">
          <StatRow label="Active campaigns" value={data.marketing.activeCampaigns} />
          <StatRow label="New leads (this month)" value={data.marketing.newLeadsCount} />
          <StatRow label="Marketing spend (MTD)" value={formatCurrency(data.marketing.monthlySpend)} />
        </SectionCard>
      </div>

      <AlertsPanel alerts={data.alerts} />
    </div>
  );
}
