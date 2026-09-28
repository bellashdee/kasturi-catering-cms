import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { CAMPAIGN_STATUS_LABEL } from "@/lib/marketing/constants";
import { formatCurrency } from "@/lib/format";
import { SectionCard, EmptyRow, StatRow } from "@/components/dashboard/SectionCard";
import { MarketingSubNav } from "@/components/marketing/MarketingSubNav";

export default async function MarketingReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const [{ data: campaigns }, { data: performance }, { data: expenses }, { count: leadsCount }, { count: convertedCount }] = await Promise.all([
    supabase.from("campaigns").select("id, name, status, budget").in("company_id", targetCompanyIds),
    supabase.from("campaign_performance").select("campaign_id, impressions, clicks, leads_generated, conversions, spend").in("company_id", targetCompanyIds),
    supabase.from("marketing_expenses").select("campaign_id, amount").in("company_id", targetCompanyIds),
    supabase.from("leads").select("id", { count: "exact", head: true }).in("company_id", targetCompanyIds),
    supabase.from("leads").select("id", { count: "exact", head: true }).in("company_id", targetCompanyIds).eq("status", "converted"),
  ]);

  const perfByCampaign = new Map<string, { impressions: number; clicks: number; leads: number; conversions: number; spend: number }>();
  for (const p of performance ?? []) {
    const cur = perfByCampaign.get(p.campaign_id) ?? { impressions: 0, clicks: 0, leads: 0, conversions: 0, spend: 0 };
    cur.impressions += p.impressions ?? 0;
    cur.clicks += p.clicks ?? 0;
    cur.leads += p.leads_generated ?? 0;
    cur.conversions += p.conversions ?? 0;
    cur.spend += Number(p.spend ?? 0);
    perfByCampaign.set(p.campaign_id, cur);
  }

  const expenseByCampaign = new Map<string, number>();
  let totalExpense = 0;
  for (const e of expenses ?? []) {
    totalExpense += Number(e.amount);
    if (e.campaign_id) expenseByCampaign.set(e.campaign_id, (expenseByCampaign.get(e.campaign_id) ?? 0) + Number(e.amount));
  }

  const totalSpendFromPerf = [...perfByCampaign.values()].reduce((t, p) => t + p.spend, 0);
  const totalLeadsFromPerf = [...perfByCampaign.values()].reduce((t, p) => t + p.leads, 0);
  const totalImpressions = [...perfByCampaign.values()].reduce((t, p) => t + p.impressions, 0);
  const totalClicks = [...perfByCampaign.values()].reduce((t, p) => t + p.clicks, 0);

  const rows = (campaigns ?? []).map((c) => {
    const perf = perfByCampaign.get(c.id) ?? { impressions: 0, clicks: 0, leads: 0, conversions: 0, spend: 0 };
    const expense = expenseByCampaign.get(c.id) ?? 0;
    return { ...c, ...perf, expense, totalSpend: perf.spend + expense };
  }).sort((a, b) => b.totalSpend - a.totalSpend);

  const conversionRate = leadsCount ? Math.round(((convertedCount ?? 0) / leadsCount) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Marketing Reports</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Performance and spend across every campaign.</p>
      </div>

      <MarketingSubNav />

      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Total Spend</div>
          <div className="mt-1 text-xl font-extrabold text-text">{formatCurrency(totalSpendFromPerf + totalExpense)}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Total Leads</div>
          <div className="mt-1 text-xl font-extrabold text-text">{leadsCount ?? 0}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Lead → Customer Rate</div>
          <div className="mt-1 text-xl font-extrabold text-text">{conversionRate}%</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Impressions / Clicks</div>
          <div className="mt-1 text-xl font-extrabold text-text">{totalImpressions.toLocaleString()} / {totalClicks.toLocaleString()}</div>
        </div>
      </div>

      <SectionCard title="Spend &amp; Performance by Campaign">
        {rows.length === 0 ? (
          <EmptyRow text="No campaigns yet." />
        ) : (
          <div className="-mx-5 -mb-5">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] border-b border-border bg-surface-alt px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Campaign</div>
              <div>Status</div>
              <div>Impressions</div>
              <div>Clicks</div>
              <div>Leads</div>
              <div>Spend</div>
            </div>
            {rows.map((r) => (
              <div key={r.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] border-b border-border px-5 py-3 text-[13px] last:border-b-0">
                <div className="font-semibold text-text">{r.name}</div>
                <div className="text-text-secondary">{CAMPAIGN_STATUS_LABEL[r.status] ?? r.status}</div>
                <div className="text-text-secondary">{r.impressions.toLocaleString()}</div>
                <div className="text-text-secondary">{r.clicks.toLocaleString()}</div>
                <div className="text-text-secondary">{r.leads}</div>
                <div className="font-semibold text-text">{formatCurrency(r.totalSpend)}</div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Totals">
        <StatRow label="Marketing expenses logged" value={formatCurrency(totalExpense)} />
        <StatRow label="Ad spend logged via performance reports" value={formatCurrency(totalSpendFromPerf)} />
        <StatRow label="Leads generated (from performance reports)" value={totalLeadsFromPerf} />
      </SectionCard>
    </div>
  );
}
