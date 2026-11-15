import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listLeadsForCompanies } from "@/lib/marketing/queries";
import { LEAD_SOURCE_LABEL, LEAD_STATUS_LABEL } from "@/lib/marketing/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { MarketingSubNav } from "@/components/marketing/MarketingSubNav";
import { MonthFilter } from "@/components/MonthFilter";
import { filterByMonth, monthLabelOf } from "@/lib/monthFilter";
import { LeadActions } from "@/components/marketing/LeadActions";
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";

const SORTS = { date: "Date added", name: "Name", source: "Source", campaign: "Campaign", status: "Status" };
const STATUS_ORDER = Object.keys(LEAD_STATUS_LABEL);

function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "converted") return "success";
  if (status === "qualified") return "info";
  if (status === "lost") return "danger";
  if (status === "new") return "warning";
  return "neutral";
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; q?: string; month?: string; source?: string; status?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { company: requestedId, q, month } = sp;
  const { sort, dir } = readSort(sp, SORTS, "date", "desc");
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const filtered = Boolean(q || sp.source || sp.status);
  const leads = sortBy(
    filterByMonth(await listLeadsForCompanies(supabase, targetCompanyIds, q), month, (l) => l.created_at).filter(
      (l) => (!sp.source || l.source === sp.source) && (!sp.status || l.status === sp.status),
    ),
    sort,
    dir,
    {
      date: (l) => l.created_at,
      name: (l) => l.name,
      source: [(l) => LEAD_SOURCE_LABEL[l.source] ?? l.source, (l) => l.created_at],
      campaign: [(l) => l.campaigns?.name, (l) => l.created_at],
      status: [(l) => STATUS_ORDER.indexOf(l.status), (l) => l.created_at],
    },
  );
  const monthLabel = monthLabelOf(month);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Leads &amp; Enquiries</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{leads.length} lead{leads.length === 1 ? "" : "s"}{monthLabel ? <span className="font-semibold text-text"> · {monthLabel}</span> : null}</p>
        </div>
        <div className="flex gap-2.5">
          <Link href={`/marketing/leads/import${query}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13px] font-semibold text-text">
            Import Excel / CSV
          </Link>
          <Link href={`/marketing/leads/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
            + New Lead
          </Link>
        </div>
      </div>

      <MarketingSubNav />
      <MonthFilter />

      <ListFilters keep={{ company: requestedId, month }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={`/marketing/leads?${new URLSearchParams({ ...(requestedId ? { company: requestedId } : {}), ...(month ? { month } : {}) }).toString()}`}>
        <FilterField label="Name">
          <input name="q" defaultValue={q ?? ""} className={`${FILTER_INPUT} w-52`} />
        </FilterField>
        <FilterField label="Source">
          <Select name="source" defaultValue={sp.source ?? ""} className={`${FILTER_INPUT} w-40`}>
            <option value="">All sources</option>
            {Object.entries(LEAD_SOURCE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Status">
          <Select name="status" defaultValue={sp.status ?? ""} className={`${FILTER_INPUT} w-36`}>
            <option value="">All statuses</option>
            {Object.entries(LEAD_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </FilterField>
      </ListFilters>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {leads.length === 0 ? (
          <EmptyRow text={filtered ? "No leads match these filters." : monthLabel ? "No leads in this month." : "No leads yet. Add one, or import an enquiry list."} />
        ) : (
          <div className="divide-y divide-border">
            {leads.map((l) => (
              <div key={l.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <div className="text-[13.5px] font-semibold text-text">{l.name}</div>
                  <div className="mt-0.5 text-xs text-text-muted">
                    {LEAD_SOURCE_LABEL[l.source] ?? l.source}
                    {l.phone && ` · ${l.phone}`}
                    {l.campaigns?.name && ` · ${l.campaigns.name}`}
                    {companies.length > 1 && l.companies?.name && ` · ${l.companies.name}`}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge tone={statusTone(l.status)}>{LEAD_STATUS_LABEL[l.status] ?? l.status}</StatusBadge>
                  <LeadActions leadId={l.id} status={l.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
