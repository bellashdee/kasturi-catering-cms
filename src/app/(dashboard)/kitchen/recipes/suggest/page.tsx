import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { KitchenSubNav } from "@/components/kitchen/KitchenSubNav";
import { RecipeSuggest } from "@/components/kitchenPurchase/RecipeSuggest";

export default async function RecipeSuggestPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const { company: requestedId } = await searchParams;
  const { accessibleIds, targetCompanyIds } = resolveCompanyScope(session, allCompanies ?? [], requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";
  const companies = (allCompanies ?? []).filter((c) => accessibleIds.includes(c.id));
  // the company chosen at the top of the menu comes first
  const ordered = [...companies.filter((c) => targetCompanyIds.includes(c.id)), ...companies.filter((c) => !targetCompanyIds.includes(c.id))];
  if (ordered.length === 0) return <EmptyRow text="You don't have access to any company yet." />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[22px] font-extrabold text-text">Kitchen</h1>
      <KitchenSubNav />
      <Link href={`/kitchen/recipes${query}`} className="text-[13.5px] font-semibold text-text-secondary hover:underline">
        ← Back to Recipes
      </Link>
      <div>
        <h2 className="text-[20px] font-extrabold text-text">Recipe from a Google reference</h2>
        <p className="mt-0.5 text-[14px] text-text-secondary">Write a menu name, review the ingredients and steps that are found, change them to our kitchen, and approve the recipe.</p>
      </div>
      <RecipeSuggest companies={ordered} />
    </div>
  );
}
