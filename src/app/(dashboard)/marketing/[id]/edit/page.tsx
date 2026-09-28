import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getCampaign } from "@/lib/marketing/queries";
import { CampaignForm } from "@/components/marketing/CampaignForm";

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();

  let campaign;
  try {
    campaign = await getCampaign(supabase, id);
  } catch {
    notFound();
  }

  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[22px] font-extrabold text-text">Edit {campaign.name}</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <CampaignForm
          campaignId={id}
          companies={allCompanies ?? []}
          initial={{
            companyId: campaign.company_id,
            name: campaign.name,
            objective: campaign.objective ?? "",
            channel: campaign.channel,
            status: campaign.status,
            startDate: campaign.start_date ?? "",
            endDate: campaign.end_date ?? "",
            budget: campaign.budget ?? undefined,
          }}
        />
      </div>
    </div>
  );
}
