import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { pastWastageItems, restaurantOf } from "@/lib/kitchen/wastageQueries";
import { todayInMalaysia } from "@/lib/format";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { WastageForm } from "@/components/kitchen/WastageForm";

export default async function NewWastagePage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];
  const { company: requestedId } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const o2 = restaurantOf(companies, targetCompanyIds);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (!o2) return <EmptyRow text="The Wastage Log is for the restaurant (O2 Life). Choose O2 Life in the company selector at the top. The catering companies record wastage in Kitchen → Stock (Adjust Stock → Wastage)." />;

  const items = await pastWastageItems(supabase, [o2.id]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/kitchen/wastage${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to the Wastage Log</Link>
      <h1 className="mt-2 text-[22px] font-extrabold text-text">New Wastage Entry</h1>
      <p className="mt-1 text-[13px] text-text-secondary">Record food that was thrown away: what it was, how much and why.</p>
      <div className="mt-5 rounded-xl border border-border bg-surface shadow-sm">
        <WastageForm companyId={o2.id} today={todayInMalaysia()} items={items} listHref={`/kitchen/wastage${query}`} />
      </div>
    </div>
  );
}
