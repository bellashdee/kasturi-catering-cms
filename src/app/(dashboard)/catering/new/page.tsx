import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { EventForm } from "@/components/catering/EventForm";

type PackageRow = { id: string; name: string; price_per_pax: number; minimum_pax: number; company_id: string; package_menu_items: { meal_type: string; item_name: string; sort_order: number }[] };

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];

  const { company: requestedId } = await searchParams;
  const { accessibleIds } = resolveCompanyScope(session, companies, requestedId);
  const selectable = companies.filter((c) => accessibleIds.includes(c.id));
  const defaultCompanyId = requestedId && accessibleIds.includes(requestedId) ? requestedId : selectable[0]?.id;

  const { data: customers } = await supabase
    .from("customers")
    .select("id, name, company_id")
    .in("company_id", accessibleIds)
    .order("name");

  const { data: packageMenus } = await supabase
    .from("package_menus")
    .select("id, name, price_per_pax, minimum_pax, company_id, package_menu_items(meal_type, item_name, sort_order)")
    .in("company_id", accessibleIds)
    .eq("is_active", true)
    .order("name");

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[22px] font-extrabold text-text">New Catering Event</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <EventForm
          companies={selectable}
          defaultCompanyId={defaultCompanyId}
          customers={customers ?? []}
          packageMenus={(packageMenus ?? []) as PackageRow[]}
        />
      </div>
    </div>
  );
}
