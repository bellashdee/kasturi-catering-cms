import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import {
  getCampaign,
  listContentForCampaign,
  listPerformanceForCampaign,
  listExpensesForCampaign,
} from "@/lib/marketing/queries";
import {
  CAMPAIGN_STATUS_LABEL,
  CAMPAIGN_CHANNEL_LABEL,
  CONTENT_PLATFORM_LABEL,
  CONTENT_STATUS_LABEL,
} from "@/lib/marketing/constants";
import { formatCurrency } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionCard, EmptyRow, StatRow } from "@/components/dashboard/SectionCard";

function statusTone(status: string): "success" | "neutral" | "danger" {
  if (status === "active" || status === "published") return "success";
  if (status === "cancelled") return "danger";
  return "neutral";
}

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ company?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { id } = await params;
  const { company: requestedId } = await searchParams;
  const query = requestedId ? `?company=${requestedId}` : "";

  const supabase = await createClient();

  let campaign;
  try {
    campaign = await getCampaign(supabase, id);
  } catch {
    notFound();
  }

  const [content, performance, expenses] = await Promise.all([
    listContentForCampaign(supabase, id),
    listPerformanceForCampaign(supabase, id),
    listExpensesForCampaign(supabase, id),
  ]);

  const totalSpend = expenses.reduce((t, e) => t + Number(e.amount), 0) + performance.reduce((t, p) => t + Number(p.spend ?? 0), 0);
  const totalLeads = performance.reduce((t, p) => t + Number(p.leads_generated ?? 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <Link href={`/marketing${query}`} className="text-[12.5px] font-semibold text-text-secondary">
            ← Back to Campaigns
          </Link>
          <div className="mt-2 text-[20px] font-extrabold text-text">{campaign.name}</div>
          <div className="text-[13px] text-text-secondary">
            {CAMPAIGN_CHANNEL_LABEL[campaign.channel] ?? campaign.channel} · {campaign.companies?.name}
            {campaign.start_date && ` · ${campaign.start_date} → ${campaign.end_date || "ongoing"}`}
          </div>
          {campaign.objective && <p className="mt-2 max-w-xl text-[13.5px] text-text-secondary">{campaign.objective}</p>}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone={statusTone(campaign.status)}>{CAMPAIGN_STATUS_LABEL[campaign.status] ?? campaign.status}</StatusBadge>
          <Link href={`/marketing/${id}/edit${query}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-[13px] font-semibold text-text">
            Edit
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Budget</div>
          <div className="mt-1 text-xl font-extrabold text-text">{campaign.budget != null ? formatCurrency(campaign.budget) : "—"}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Total Spend</div>
          <div className="mt-1 text-xl font-extrabold text-text">{formatCurrency(totalSpend)}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Leads Generated</div>
          <div className="mt-1 text-xl font-extrabold text-text">{totalLeads}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <SectionCard title="Content" action={<Link href={`/marketing/content/new?campaign=${id}${requestedId ? `&company=${requestedId}` : ""}`} className="text-[12.5px] font-semibold text-primary">+ Add Content</Link>}>
          {content.length === 0 ? (
            <EmptyRow text="No content planned for this campaign yet." />
          ) : (
            <div className="-mx-5 -mb-5 divide-y divide-border">
              {content.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <div className="text-[13px] font-semibold text-text">{c.title}</div>
                    <div className="text-xs text-text-muted">
                      {CONTENT_PLATFORM_LABEL[c.platform] ?? c.platform} · {c.scheduled_date || "No date"}
                    </div>
                  </div>
                  <StatusBadge tone={statusTone(c.status)}>{CONTENT_STATUS_LABEL[c.status] ?? c.status}</StatusBadge>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Performance" action={<Link href={`/marketing/${id}/performance/new${query}`} className="text-[12.5px] font-semibold text-primary">+ Log Performance</Link>}>
          {performance.length === 0 ? (
            <EmptyRow text="No performance data logged yet." />
          ) : (
            <div className="-mx-5 -mb-5 divide-y divide-border">
              {performance.map((p) => (
                <div key={p.id} className="px-5 py-3 text-[13px]">
                  <div className="font-semibold text-text">{p.report_date}</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
                    <span>Impressions: {p.impressions ?? "—"}</span>
                    <span>Clicks: {p.clicks ?? "—"}</span>
                    <span>Leads: {p.leads_generated ?? "—"}</span>
                    <span>Conversions: {p.conversions ?? "—"}</span>
                    <span>Spend: {p.spend != null ? formatCurrency(p.spend) : "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Linked Expenses" action={<Link href={`/marketing/expenses/new?campaign=${id}${requestedId ? `&company=${requestedId}` : ""}`} className="text-[12.5px] font-semibold text-primary">+ Log Expense</Link>}>
          {expenses.length === 0 ? (
            <EmptyRow text="No expenses logged against this campaign yet." />
          ) : (
            <div className="-mx-5 -mb-5 divide-y divide-border">
              {expenses.map((e) => (
                <div key={e.id} className="flex items-center justify-between px-5 py-3 text-[13px]">
                  <div>
                    <div className="font-semibold text-text">{e.description}</div>
                    <div className="text-xs text-text-muted">{e.expense_date}</div>
                  </div>
                  <div className="font-bold text-text">{formatCurrency(e.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Summary">
          <StatRow label="Budget" value={campaign.budget != null ? formatCurrency(campaign.budget) : "—"} />
          <StatRow label="Actual spend" value={formatCurrency(totalSpend)} />
          <StatRow label="Content items" value={content.length} />
          <StatRow label="Performance reports" value={performance.length} />
        </SectionCard>
      </div>
    </div>
  );
}
