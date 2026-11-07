import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listPayrollForCompanies } from "@/lib/hr/queries";
import { PAYROLL_STATUS_LABEL } from "@/lib/hr/constants";
import { formatCurrency } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { canUsePayrollCentre } from "@/lib/hr/payrollAccess";
import { MarkPaidButton } from "@/components/hr/MarkPaidButton";
import { MonthFilter } from "@/components/MonthFilter";
import { filterByMonth, monthLabelOf } from "@/lib/monthFilter";

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; month?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  if (!(await canUsePayrollCentre(supabase))) return <EmptyRow text="Payroll is private. Only the Director of Finance and her personal assistant can open it." />;
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, month } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  // the month is the month the pay period ends in
  const records = filterByMonth(await listPayrollForCompanies(supabase, targetCompanyIds), month, (r) => r.pay_period_end);
  const monthLabel = monthLabelOf(month);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Payroll</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          {records.length} payroll record{records.length === 1 ? "" : "s"} · all employees you can access
          {monthLabel ? <span className="font-semibold text-text"> · {monthLabel}</span> : null}
        </p>
      </div>

      <MonthFilter />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {records.length === 0 ? (
          <EmptyRow text={monthLabel ? "No payroll records in this month." : "No payroll records yet."} />
        ) : (
          <div className="divide-y divide-border">
            {records.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <div className="text-[13.5px] font-semibold text-text">
                    <Link href={`/hr/${r.employee_id}`} className="hover:text-primary">{r.employees?.full_name}</Link>
                  </div>
                  <div className="mt-0.5 text-xs text-text-muted">
                    {r.pay_period_start} → {r.pay_period_end} · Net {formatCurrency(r.net_pay)} · {r.companies?.name}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge tone={r.status === "paid" ? "success" : "neutral"}>
                    {PAYROLL_STATUS_LABEL[r.status] ?? r.status}
                  </StatusBadge>
                  {r.status === "draft" && <MarkPaidButton payrollId={r.id} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
