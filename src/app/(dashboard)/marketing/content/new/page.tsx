import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { ContentItemForm } from "@/components/marketing/ContentItemForm";

export default async function NewContentPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; campaign?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];

  const { company: requestedId, campaign: campaignId } = await searchParams;
  const { accessibleIds } = resolveCompanyScope(session, companies, requestedId);
  const selectable = companies.filter((c) => accessibleIds.includes(c.id));

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name, company_id")
    .in("company_id", accessibleIds)
    .order("name");

  const linkedCampaign = campaignId ? (campaigns ?? []).find((c) => c.id === campaignId) : undefined;
  const defaultCompanyId = linkedCampaign?.company_id
    ?? (requestedId && accessibleIds.includes(requestedId) ? requestedId : selectable[0]?.id);

  const redirectTo = campaignId ? `/marketing/${campaignId}` : "/marketing/content";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[22px] font-extrabold text-text">Add Content</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <ContentItemForm
          companies={selectable}
          defaultCompanyId={defaultCompanyId}
          campaigns={campaigns ?? []}
          defaultCampaignId={campaignId}
          redirectTo={redirectTo}
        />
      </div>
    </div>
  );
}
