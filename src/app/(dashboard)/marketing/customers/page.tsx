import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listCustomersForCompanies } from "@/lib/marketing/queries";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { MarketingSubNav } from "@/components/marketing/MarketingSubNav";
import { MonthFilter } from "@/components/MonthFilter";
import { filterByMonth, monthLabelOf } from "@/lib/monthFilter";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";

const SORTS = { name: "Name", contact: "Contact person", added: "Date added" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; q?: string; month?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { company: requestedId, q, month } = sp;
  const { sort, dir } = readSort(sp, SORTS, "name", "asc");
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const customers = sortBy(filterByMonth(await listCustomersForCompanies(supabase, targetCompanyIds, q), month, (c) => c.created_at), sort, dir, {
    name: (c) => c.name,
    contact: [(c) => c.contact_person, (c) => c.name],
    added: [(c) => c.created_at, (c) => c.name],
  });
  const monthLabel = monthLabelOf(month);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Customers</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{customers.length} customer{customers.length === 1 ? "" : "s"}{monthLabel ? <span className="font-semibold text-text"> · {monthLabel}</span> : null}</p>
        </div>
        <Link href={`/marketing/customers/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Customer
        </Link>
      </div>

      <MarketingSubNav />
      <MonthFilter />

      <ListFilters keep={{ company: requestedId, month }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={`/marketing/customers?${new URLSearchParams({ ...(requestedId ? { company: requestedId } : {}), ...(month ? { month } : {}) }).toString()}`}>
        <FilterField label="Name">
          <input name="q" defaultValue={q ?? ""} className={`${FILTER_INPUT} w-56`} />
        </FilterField>
      </ListFilters>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {customers.length === 0 ? (
          <EmptyRow text={q ? "No customers match these filters." : monthLabel ? "No customers added in this month." : "No customers yet. Add one, or convert a lead from the Leads tab."} />
        ) : (
          <div className="divide-y divide-border">
            {customers.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <div className="text-[13.5px] font-semibold text-text">{c.name}</div>
                  <div className="mt-0.5 text-xs text-text-muted">
                    {c.contact_person && `${c.contact_person} · `}
                    {c.phone || "No phone"}
                    {companies.length > 1 && c.companies?.name && ` · ${c.companies.name}`}
                  </div>
                </div>
                <div className="text-xs text-text-muted">{c.email || ""}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
