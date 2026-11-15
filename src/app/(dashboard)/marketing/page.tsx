import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listCampaigns } from "@/lib/marketing/queries";
import { CAMPAIGN_STATUS_LABEL, CAMPAIGN_CHANNEL_LABEL } from "@/lib/marketing/constants";
import { formatCurrency } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { MarketingSubNav } from "@/components/marketing/MarketingSubNav";
import { MonthFilter } from "@/components/MonthFilter";
import { monthLabelOf, monthRange } from "@/lib/monthFilter";
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";

const SORTS = { date: "Start date", end: "End date", name: "Campaign", channel: "Channel", budget: "Budget", status: "Status" };
const STATUS_ORDER = Object.keys(CAMPAIGN_STATUS_LABEL);

function statusTone(status: string): "success" | "neutral" | "danger" {
  if (status === "active") return "success";
  if (status === "cancelled") return "danger";
  return "neutral";
}

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; q?: string; month?: string; channel?: string; status?: string; sort?: string; dir?: string }>;
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

  // a campaign belongs to the month when its start-to-end dates overlap that month (one with only one date counts by that date; one with no date is left out)
  const range = monthRange(month);
  const inMonth = (await listCampaigns(supabase, targetCompanyIds, q)).filter((c) => {
    if (!range) return true;
    const start = c.start_date ?? c.end_date;
    const end = c.end_date ?? c.start_date;
    return !!start && !!end && start <= range.end && end >= range.start;
  });
  const filtered = Boolean(q || sp.channel || sp.status);
  const campaigns = sortBy(
    inMonth.filter((c) => (!sp.channel || c.channel === sp.channel) && (!sp.status || c.status === sp.status)),
    sort,
    dir,
    {
      date: [(c) => c.start_date, (c) => c.name],
      end: [(c) => c.end_date, (c) => c.name],
      name: (c) => c.name,
      channel: [(c) => CAMPAIGN_CHANNEL_LABEL[c.channel] ?? c.channel, (c) => c.start_date],
      budget: (c) => c.budget,
      status: [(c) => STATUS_ORDER.indexOf(c.status), (c) => c.start_date],
    },
  );
  const monthLabel = monthLabelOf(month);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Marketing</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}{monthLabel ? <span className="font-semibold text-text"> · {monthLabel}</span> : null}
          </p>
        </div>
        <Link href={`/marketing/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Campaign
        </Link>
      </div>

      <MarketingSubNav />
      <MonthFilter />

      <ListFilters keep={{ company: requestedId, month }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={`/marketing?${new URLSearchParams({ ...(requestedId ? { company: requestedId } : {}), ...(month ? { month } : {}) }).toString()}`}>
        <FilterField label="Campaign">
          <input name="q" defaultValue={q ?? ""} className={`${FILTER_INPUT} w-52`} />
        </FilterField>
        <FilterField label="Channel">
          <Select name="channel" defaultValue={sp.channel ?? ""} className={`${FILTER_INPUT} w-40`}>
            <option value="">All channels</option>
            {Object.entries(CAMPAIGN_CHANNEL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Status">
          <Select name="status" defaultValue={sp.status ?? ""} className={`${FILTER_INPUT} w-36`}>
            <option value="">All statuses</option>
            {Object.entries(CAMPAIGN_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </FilterField>
      </ListFilters>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {campaigns.length === 0 ? (
          <EmptyRow text={filtered ? "No campaigns match these filters." : monthLabel ? "No campaigns running in this month." : "No campaigns yet. Create one to start planning content, leads and spend."} />
        ) : (
          <div>
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Campaign</div>
              <div>Channel</div>
              <div>Start Date</div>
              <div>End Date</div>
              <div>Budget</div>
              <div>Status</div>
            </div>
            {campaigns.map((c) => (
              <Link
                key={c.id}
                href={`/marketing/${c.id}${query}`}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0 hover:bg-surface-alt"
              >
                <div className="font-semibold text-text">
                  {c.name}
                  {companies.length > 1 && (
                    <span className="ml-2 text-[11px] font-normal text-text-muted">{c.companies?.name}</span>
                  )}
                </div>
                <div className="text-text-secondary">{CAMPAIGN_CHANNEL_LABEL[c.channel] ?? c.channel}</div>
                <div className="text-text-secondary">{c.start_date || "—"}</div>
                <div className="text-text-secondary">{c.end_date || "—"}</div>
                <div className="text-text-secondary">{c.budget != null ? formatCurrency(c.budget) : "—"}</div>
                <div>
                  <StatusBadge tone={statusTone(c.status)}>{CAMPAIGN_STATUS_LABEL[c.status] ?? c.status}</StatusBadge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
