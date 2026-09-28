import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listMenus } from "@/lib/kitchen/queries";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { KitchenSubNav } from "@/components/kitchen/KitchenSubNav";

export default async function MenusPage({
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

  const menus = await listMenus(supabase, targetCompanyIds);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Kitchen</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{menus.length} menu{menus.length === 1 ? "" : "s"}</p>
        </div>
        <Link href={`/kitchen/menus/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Menu
        </Link>
      </div>

      <KitchenSubNav />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {menus.length === 0 ? (
          <EmptyRow text="No menus yet. Create one to group menu items that recipes can link to." />
        ) : (
          <div>
            <div className="grid grid-cols-[2fr_1fr_1fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Menu</div>
              <div>Items</div>
              <div>Company</div>
            </div>
            {menus.map((m) => (
              <Link
                key={m.id}
                href={`/kitchen/menus/${m.id}${query}`}
                className="grid grid-cols-[2fr_1fr_1fr] border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0 hover:bg-surface-alt"
              >
                <div>
                  <div className="font-semibold text-text">{m.name}</div>
                  {m.description && <div className="text-xs text-text-muted">{m.description}</div>}
                </div>
                <div className="text-text-secondary">{m.menu_items?.length ?? 0}</div>
                <div className="text-text-secondary">{m.companies?.name}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
