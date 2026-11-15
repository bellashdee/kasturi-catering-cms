import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { IntakeReviewActions } from "@/components/catering/IntakeReviewActions";
import { MonthFilter } from "@/components/MonthFilter";
import { filterByMonth, monthLabelOf } from "@/lib/monthFilter";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";

type SearchParams = { company?: string; month?: string; customer?: string; agent?: string; sort?: string; dir?: string };

const SORTS = { date: "Date submitted", customer: "Customer", agent: "Sales agent" };

export default async function CustomerSubmissionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];
  const sp = await searchParams;
  const { company: requestedId, month } = sp;
  const { sort, dir } = readSort(sp, SORTS, "date", "desc");
  const monthLabel = monthLabelOf(month);
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  const { data: rows } = await supabase
    .from("customer_intake_submissions")
    .select("*, companies(name)")
    .in("company_id", targetCompanyIds)
    .order("created_at", { ascending: false })
    .limit(200);
  // the month is the day the details were submitted
  const has = (value: string | null | undefined, part: string | undefined) => !part || (value ?? "").toLowerCase().includes(part.trim().toLowerCase());
  const filtered = Boolean(sp.customer || sp.agent);
  const submissions = sortBy(
    filterByMonth(rows ?? [], month, (s) => s.created_at).filter((s) => has(s.name, sp.customer) && has(s.sales_agent, sp.agent)),
    sort,
    dir,
    {
      date: (s) => s.created_at,
      customer: [(s) => s.name, (s) => s.created_at],
      agent: [(s) => s.sales_agent, (s) => s.created_at],
    },
  );
  const pending = submissions.filter((s) => s.status === "pending");
  const reviewed = submissions.filter((s) => s.status !== "pending");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/catering/customers${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Customer Database</Link>
        <h1 className="mt-1 text-[22px] font-extrabold text-text">Customer Submissions</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          Details sent by sales agents through the customer form. Approving one adds it to the Customer Database.{monthLabel ? <span className="font-semibold text-text"> · {monthLabel}</span> : null}
        </p>
      </div>

      <MonthFilter />

      <ListFilters keep={{ company: requestedId, month }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={`/catering/customers/submissions?${new URLSearchParams({ ...(requestedId ? { company: requestedId } : {}), ...(month ? { month } : {}) }).toString()}`}>
        <FilterField label="Customer">
          <input name="customer" defaultValue={sp.customer ?? ""} className={`${FILTER_INPUT} w-44`} />
        </FilterField>
        <FilterField label="Sales agent">
          <input name="agent" defaultValue={sp.agent ?? ""} className={`${FILTER_INPUT} w-40`} />
        </FilterField>
      </ListFilters>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-5 py-3 text-[13px] font-bold text-text">Waiting for review ({pending.length})</div>
        {pending.length === 0 ? (
          <EmptyRow text={filtered ? "Nothing waiting for review matches these filters." : monthLabel ? "Nothing waiting for review in this month." : "Nothing waiting for review."} />
        ) : (
          <div className="divide-y divide-border">
            {pending.map((s) => (
              <div key={s.id} className="flex items-start justify-between gap-4 px-5 py-4">
                <div className="text-[13px]">
                  <div className="text-[14px] font-bold text-text">
                    {s.name} {companies.length > 1 && <span className="text-[11px] font-normal text-text-muted">{s.companies?.name}</span>}
                  </div>
                  <div className="text-text-secondary">{[s.contact_person, s.phone, s.email].filter(Boolean).join(" · ")}</div>
                  {s.registration_no && <div className="text-text-secondary">SSM: {s.registration_no}</div>}
                  {s.billing_address && <div className="mt-1 whitespace-pre-line text-text-secondary"><span className="font-semibold">Billing:</span> {s.billing_address}</div>}
                  {s.delivery_address && <div className="whitespace-pre-line text-text-secondary"><span className="font-semibold">Delivery:</span> {s.delivery_address}</div>}
                  {s.area && <div className="text-text-secondary"><span className="font-semibold">Area:</span> {s.area}</div>}
                  {s.notes && <div className="whitespace-pre-line text-text-secondary"><span className="font-semibold">Notes:</span> {s.notes}</div>}
                  <div className="mt-1 text-xs text-text-muted">Sales agent: {s.sales_agent} · {s.created_at.slice(0, 10)}</div>
                </div>
                <IntakeReviewActions submissionId={s.id} />
              </div>
            ))}
          </div>
        )}
      </div>

      {reviewed.length > 0 && (
        <div className="rounded-xl border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-5 py-3 text-[13px] font-bold text-text">Reviewed ({reviewed.length})</div>
          <div className="divide-y divide-border">
            {reviewed.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-5 py-3 text-[13px]">
                <div>
                  <span className="font-semibold text-text">{s.name}</span>
                  <span className="ml-2 text-xs text-text-muted">{s.sales_agent} · {s.created_at.slice(0, 10)}</span>
                </div>
                <div className="flex items-center gap-3">
                  {s.customer_id && <Link href={`/catering/customers/${s.customer_id}${query}`} className="text-xs font-semibold text-primary">Open customer</Link>}
                  <StatusBadge tone={s.status === "approved" ? "success" : "neutral"}>{s.status === "approved" ? "Approved" : "Rejected"}</StatusBadge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
