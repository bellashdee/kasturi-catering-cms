import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listPromotionsForCompanies } from "@/lib/marketing/queries";
import { PROMOTION_STATUS_LABEL } from "@/lib/marketing/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { MarketingSubNav } from "@/components/marketing/MarketingSubNav";
import { MonthFilter } from "@/components/MonthFilter";
import { monthLabelOf, monthRange } from "@/lib/monthFilter";
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";

const SORTS = { date: "Start date", end: "End date", title: "Title", campaign: "Campaign", status: "Status" };
const STATUS_ORDER = Object.keys(PROMOTION_STATUS_LABEL);

function statusTone(status: string): "success" | "neutral" | "danger" {
  if (status === "active") return "success";
  if (status === "cancelled" || status === "expired") return "danger";
  return "neutral";
}

export default async function PromotionsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; month?: string; q?: string; status?: string; sort?: string; dir?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { company: requestedId, month, q } = sp;
  const { sort, dir } = readSort(sp, SORTS, "date", "desc");
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  // a promotion belongs to the month when its start-to-end dates overlap that month
  const range = monthRange(month);
  const needle = (q ?? "").trim().toLowerCase();
  const filtered = Boolean(needle || sp.status);
  const promotions = sortBy(
    (await listPromotionsForCompanies(supabase, targetCompanyIds)).filter(
      (p) =>
        (!range || (p.start_date <= range.end && p.end_date >= range.start)) &&
        (!needle || p.title.toLowerCase().includes(needle) || (p.code ?? "").toLowerCase().includes(needle)) &&
        (!sp.status || p.status === sp.status),
    ),
    sort,
    dir,
    {
      date: [(p) => p.start_date, (p) => p.title],
      end: [(p) => p.end_date, (p) => p.title],
      title: (p) => p.title,
      campaign: [(p) => p.campaigns?.name, (p) => p.start_date],
      status: [(p) => STATUS_ORDER.indexOf(p.status), (p) => p.start_date],
    },
  );
  const monthLabel = monthLabelOf(month);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Promotions</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{promotions.length} promotion{promotions.length === 1 ? "" : "s"}{monthLabel ? <span className="font-semibold text-text"> · {monthLabel}</span> : null}</p>
        </div>
        <Link href={`/marketing/promotions/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Promotion
        </Link>
      </div>

      <MarketingSubNav />
      <MonthFilter />

      <ListFilters keep={{ company: requestedId, month }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={`/marketing/promotions?${new URLSearchParams({ ...(requestedId ? { company: requestedId } : {}), ...(month ? { month } : {}) }).toString()}`}>
        <FilterField label="Title / code">
          <input name="q" defaultValue={q ?? ""} className={`${FILTER_INPUT} w-52`} />
        </FilterField>
        <FilterField label="Status">
          <Select name="status" defaultValue={sp.status ?? ""} className={`${FILTER_INPUT} w-36`}>
            <option value="">All statuses</option>
            {Object.entries(PROMOTION_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </FilterField>
      </ListFilters>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {promotions.length === 0 ? (
          <EmptyRow text={filtered ? "No promotions match these filters." : monthLabel ? "No promotions running in this month." : "No promotions yet."} />
        ) : (
          <div className="divide-y divide-border">
            {promotions.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <div className="text-[13.5px] font-semibold text-text">
                    {p.title} {p.code && <span className="ml-2 rounded bg-surface-alt px-1.5 py-0.5 text-[11px] font-mono text-text-secondary">{p.code}</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-text-muted">
                    {p.discount_type === "percentage" ? `${p.discount_value}% off` : `RM ${p.discount_value} off`} · {p.start_date} → {p.end_date}
                    {p.campaigns?.name && ` · ${p.campaigns.name}`}
                  </div>
                </div>
                <StatusBadge tone={statusTone(p.status)}>{PROMOTION_STATUS_LABEL[p.status] ?? p.status}</StatusBadge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
