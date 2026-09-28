import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getCampaign } from "@/lib/marketing/queries";
import { CampaignPerformanceUploadReview } from "@/components/marketing/CampaignPerformanceUploadReview";

export default async function NewPerformancePage({ params }: { params: Promise<{ id: string }> }) {
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

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/marketing/${id}`} className="text-[12.5px] font-semibold text-text-secondary">
        ← Back to {campaign.name}
      </Link>
      <h1 className="mt-2 text-[22px] font-extrabold text-text">Log Campaign Performance</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface shadow-sm">
        <CampaignPerformanceUploadReview campaignId={id} companyId={campaign.company_id} />
      </div>
    </div>
  );
}
