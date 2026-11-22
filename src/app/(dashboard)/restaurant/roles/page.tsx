import { redirect } from "next/navigation";
import { getRestaurantContext } from "@/lib/restaurant/access";
import { RestaurantSubNav } from "@/components/restaurant/RestaurantSubNav";
import { NotRestaurant } from "@/components/restaurant/NotRestaurant";
import { RolesManager, type PersonRoles } from "@/components/restaurant/RolesManager";

export default async function StaffRolesPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const sp = await searchParams;
  const ctx = await getRestaurantContext(sp.company);
  if (!ctx) return <NotRestaurant />;
  if (!ctx.can.roles) redirect(`/restaurant${ctx.query}`);

  // everybody who may see O2 Life: the people with an access row for it and the people with access to every company
  const [{ data: access }, { data: roleRows }] = await Promise.all([
    ctx.db.from("user_company_access").select("user_id, company_id, allowed_modules").or(`company_id.eq.${ctx.company.id},company_id.is.null`),
    ctx.db.from("rst_staff_roles").select("id, user_id, role").eq("company_id", ctx.company.id),
  ]);
  const grants = (access ?? []) as { user_id: string; company_id: string | null; allowed_modules: string[] | null }[];
  const ids = Array.from(new Set(grants.map((g) => g.user_id)));
  const { data: profiles } = ids.length ? await ctx.db.from("profiles").select("id, full_name, email, is_active").in("id", ids) : { data: [] };

  const roles = (roleRows ?? []) as { id: string; user_id: string; role: string }[];
  const people: PersonRoles[] = ((profiles ?? []) as { id: string; full_name: string | null; email: string | null; is_active: boolean | null }[])
    .filter((p) => p.is_active !== false)
    .map((p) => {
      const mine = grants.filter((g) => g.user_id === p.id);
      return {
        userId: p.id,
        name: p.full_name?.trim() || p.email || "Unknown",
        login: p.email ?? "",
        hasModule: mine.some((g) => g.allowed_modules === null || g.allowed_modules.includes("restaurant")),
        roles: roles.filter((r) => r.user_id === p.id).map((r) => ({ id: r.id, role: r.role })),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Staff Roles</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">{ctx.company.name} · who may enter sales, close the cash and cancel</p>
      </div>
      <RestaurantSubNav isAdmin />
      <RolesManager companyId={ctx.company.id} people={people} />
    </div>
  );
}
