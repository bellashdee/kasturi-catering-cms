import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listContentForCompanies } from "@/lib/marketing/queries";
import { CONTENT_PLATFORM_LABEL, CONTENT_TYPE_LABEL, CONTENT_STATUS_LABEL } from "@/lib/marketing/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { MarketingSubNav } from "@/components/marketing/MarketingSubNav";
import { MonthFilter } from "@/components/MonthFilter";
import { filterByMonth, monthLabelOf } from "@/lib/monthFilter";
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";

const SORTS = { date: "Scheduled date", title: "Title", platform: "Platform", campaign: "Campaign", status: "Status" };
const STATUS_ORDER = Object.keys(CONTENT_STATUS_LABEL);

function statusTone(status: string): "success" | "neutral" | "danger" | "info" {
  if (status === "published") return "success";
  if (status === "cancelled") return "danger";
  if (status === "scheduled") return "info";
  return "neutral";
}

export default async function ContentCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; month?: string; q?: string; platform?: string; status?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { company: requestedId, month, q } = sp;
  const { sort, dir } = readSort(sp, SORTS, "date", "asc");
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const filtered = Boolean(q || sp.platform || sp.status);
  const items = sortBy(
    filterByMonth(await listContentForCompanies(supabase, targetCompanyIds), month, (i) => i.scheduled_date).filter(
      (i) => (!q || i.title.toLowerCase().includes(q.trim().toLowerCase())) && (!sp.platform || i.platform === sp.platform) && (!sp.status || i.status === sp.status),
    ),
    sort,
    dir,
    {
      date: [(i) => i.scheduled_date, (i) => i.title],
      title: (i) => i.title,
      platform: [(i) => CONTENT_PLATFORM_LABEL[i.platform] ?? i.platform, (i) => i.scheduled_date],
      campaign: [(i) => i.campaigns?.name, (i) => i.scheduled_date],
      status: [(i) => STATUS_ORDER.indexOf(i.status), (i) => i.scheduled_date],
    },
  );
  const monthLabel = monthLabelOf(month);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Content Calendar</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{items.length} post{items.length === 1 ? "" : "s"}{monthLabel ? <span className="font-semibold text-text"> · {monthLabel}</span> : null}</p>
        </div>
        <Link href={`/marketing/content/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Content
        </Link>
      </div>

      <MarketingSubNav />
      <MonthFilter />

      <ListFilters keep={{ company: requestedId, month }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={`/marketing/content?${new URLSearchParams({ ...(requestedId ? { company: requestedId } : {}), ...(month ? { month } : {}) }).toString()}`}>
        <FilterField label="Title">
          <input name="q" defaultValue={q ?? ""} className={`${FILTER_INPUT} w-52`} />
        </FilterField>
        <FilterField label="Platform">
          <Select name="platform" defaultValue={sp.platform ?? ""} className={`${FILTER_INPUT} w-40`}>
            <option value="">All platforms</option>
            {Object.entries(CONTENT_PLATFORM_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Status">
          <Select name="status" defaultValue={sp.status ?? ""} className={`${FILTER_INPUT} w-36`}>
            <option value="">All statuses</option>
            {Object.entries(CONTENT_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </FilterField>
      </ListFilters>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {items.length === 0 ? (
          <EmptyRow text={filtered ? "No content matches these filters." : monthLabel ? "No content planned in this month." : "No content planned yet."} />
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <div className="text-[13.5px] font-semibold text-text">{item.title}</div>
                  <div className="mt-0.5 text-xs text-text-muted">
                    {CONTENT_PLATFORM_LABEL[item.platform] ?? item.platform} · {CONTENT_TYPE_LABEL[item.content_type] ?? item.content_type}
                    {item.scheduled_date && ` · ${item.scheduled_date}`}
                    {item.campaigns?.name && ` · ${item.campaigns.name}`}
                  </div>
                </div>
                <StatusBadge tone={statusTone(item.status)}>{CONTENT_STATUS_LABEL[item.status] ?? item.status}</StatusBadge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
