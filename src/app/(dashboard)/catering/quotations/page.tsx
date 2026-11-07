import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listQuotationsForCompanies } from "@/lib/catering/queries";
import { QUOTATION_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/catering/constants";
import { formatCurrency } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { QuotationActions } from "@/components/catering/QuotationActions";
import { CateringSubNav } from "@/components/catering/CateringSubNav";
import { MonthFilter } from "@/components/MonthFilter";
import { filterByMonth, monthLabelOf } from "@/lib/monthFilter";

function quotationTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "accepted") return "success";
  if (status === "rejected") return "danger";
  if (status === "sent") return "warning";
  return "neutral";
}

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; month?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, month } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  // the month is the event date of the quotation (the date shown on each row)
  const quotations = filterByMonth(await listQuotationsForCompanies(supabase, targetCompanyIds), month, (q) => q.catering_events?.event_date);
  const monthLabel = monthLabelOf(month);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Quotations</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{quotations.length} quotation{quotations.length === 1 ? "" : "s"} across every catering event you can access{monthLabel ? <span className="font-semibold text-text"> · {monthLabel}</span> : null}</p>
      </div>

      <CateringSubNav />

      <MonthFilter />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {quotations.length === 0 ? (
          <EmptyRow text={monthLabel ? "No quotation in this month." : "No quotations yet."} />
        ) : (
          <div className="divide-y divide-border">
            {quotations.map((q) => (
              <div key={q.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <div className="text-[13.5px] font-semibold text-text">
                    <Link href={`/catering/${q.catering_event_id}`} className="hover:text-primary">{q.catering_events?.event_name}</Link>
                    <span className="ml-2 font-normal text-text-secondary">{q.quotation_number} · {formatCurrency(q.total_amount)}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-text-muted">
                    {q.catering_events?.event_date} · {q.companies?.name} · Payment: {PAYMENT_STATUS_LABEL[q.payment_status] ?? q.payment_status}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge tone={quotationTone(q.status)}>{QUOTATION_STATUS_LABEL[q.status] ?? q.status}</StatusBadge>
                  <QuotationActions quotationId={q.id} status={q.status} paymentStatus={q.payment_status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
