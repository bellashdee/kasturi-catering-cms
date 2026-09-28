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
import { SearchBox } from "@/components/SearchBox";
import { MarketingSubNav } from "@/components/marketing/MarketingSubNav";

function statusTone(status: string): "success" | "neutral" | "danger" {
  if (status === "active") return "success";
  if (status === "cancelled") return "danger";
  return "neutral";
}

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; q?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, q } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const campaigns = await listCampaigns(supabase, targetCompanyIds, q);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Marketing</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link href={`/marketing/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Campaign
        </Link>
      </div>

      <MarketingSubNav />
      <SearchBox placeholder="Search campaigns by name..." />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {campaigns.length === 0 ? (
          <EmptyRow text="No campaigns yet. Create one to start planning content, leads and spend." />
        ) : (
          <div>
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Campaign</div>
              <div>Channel</div>
              <div>Start</div>
              <div>End</div>
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
