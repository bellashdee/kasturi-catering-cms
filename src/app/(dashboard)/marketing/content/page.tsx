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

function statusTone(status: string): "success" | "neutral" | "danger" | "info" {
  if (status === "published") return "success";
  if (status === "cancelled") return "danger";
  if (status === "scheduled") return "info";
  return "neutral";
}

export default async function ContentCalendarPage({
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
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const items = await listContentForCompanies(supabase, targetCompanyIds);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Content Calendar</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">Social media content planning across all campaigns.</p>
        </div>
        <Link href={`/marketing/content/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + Add Content
        </Link>
      </div>

      <MarketingSubNav />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {items.length === 0 ? (
          <EmptyRow text="Nothing planned yet." />
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
