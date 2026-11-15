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
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";

const SORTS = { created: "Date created", date: "Event date", number: "Quotation No.", event: "Event name", amount: "Amount", status: "Status" };
const STATUS_ORDER = Object.keys(QUOTATION_STATUS_LABEL);

function quotationTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "accepted") return "success";
  if (status === "rejected") return "danger";
  if (status === "sent") return "warning";
  return "neutral";
}

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; month?: string; q?: string; status?: string; payment?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { company: requestedId, month, q } = sp;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  // the month is the event date of the quotation (the date shown on each row)
  const { sort, dir } = readSort(sp, SORTS, "created", "desc");
  const has = (value: string | null | undefined, part: string | undefined) => !part || (value ?? "").toLowerCase().includes(part.trim().toLowerCase());
  const filtered = Boolean(q || sp.status || sp.payment);
  const quotations = sortBy(
    filterByMonth(await listQuotationsForCompanies(supabase, targetCompanyIds), month, (r) => r.catering_events?.event_date).filter(
      (r) => (has(r.catering_events?.event_name, q) || has(r.quotation_number, q)) && (!sp.status || r.status === sp.status) && (!sp.payment || r.payment_status === sp.payment),
    ),
    sort,
    dir,
    {
      created: (r) => r.created_at,
      date: [(r) => r.catering_events?.event_date, (r) => r.created_at],
      number: (r) => r.quotation_number,
      event: [(r) => r.catering_events?.event_name, (r) => r.created_at],
      amount: (r) => r.total_amount,
      status: [(r) => STATUS_ORDER.indexOf(r.status), (r) => r.created_at],
    },
  );
  const monthLabel = monthLabelOf(month);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Quotations</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{quotations.length} quotation{quotations.length === 1 ? "" : "s"} across every catering event you can access{monthLabel ? <span className="font-semibold text-text"> · {monthLabel}</span> : null}</p>
      </div>

      <CateringSubNav />

      <MonthFilter />

      <ListFilters keep={{ company: requestedId, month }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={`/catering/quotations?${new URLSearchParams({ ...(requestedId ? { company: requestedId } : {}), ...(month ? { month } : {}) }).toString()}`}>
        <FilterField label="Event name / quotation no.">
          <input name="q" defaultValue={q ?? ""} className={`${FILTER_INPUT} w-52`} />
        </FilterField>
        <FilterField label="Status">
          <Select name="status" defaultValue={sp.status ?? ""} className={`${FILTER_INPUT} w-36`}>
            <option value="">All statuses</option>
            {Object.entries(QUOTATION_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Payment status">
          <Select name="payment" defaultValue={sp.payment ?? ""} className={`${FILTER_INPUT} w-40`}>
            <option value="">All</option>
            {Object.entries(PAYMENT_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </FilterField>
      </ListFilters>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {quotations.length === 0 ? (
          <EmptyRow text={filtered ? "No quotations match these filters." : monthLabel ? "No quotations in this month." : "No quotations yet."} />
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
