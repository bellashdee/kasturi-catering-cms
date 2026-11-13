import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listPackageMenus } from "@/lib/kitchen/packages/queries";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { KitchenSubNav } from "@/components/kitchen/KitchenSubNav";
import { packagePriceLabel } from "@/lib/kitchen/packages/format";
import { Select } from "@/components/ui/Select";

/** The fixed menu sets (Signature Solution), shown first and in this order; other packages come after them. */
const MENU_SETS = ["JDT 2", "JDT 3", "JDT 4", "JDT UTM"];

export default async function PackageMenusPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; set?: string; q?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, set: setParam, q } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const allPackages = await listPackageMenus(supabase, targetCompanyIds);
  const setOf = (p: unknown) => (p as { menu_set?: string | null }).menu_set ?? null;
  const sets = MENU_SETS.filter((m) => allPackages.some((p) => setOf(p) === m));
  const activeSet = setParam === "other" || sets.includes(setParam ?? "") ? setParam : undefined;
  const search = q?.trim().toLowerCase();
  const packages = allPackages.filter((p) => (!activeSet || (activeSet === "other" ? !setOf(p) : setOf(p) === activeSet)) && (!search || p.name.toLowerCase().includes(search)));
  const groups = [...sets.map((m) => ({ key: m, title: m, items: packages.filter((p) => setOf(p) === m) })), { key: "other", title: sets.length ? "Other packages" : "Packages", items: packages.filter((p) => !setOf(p)) }].filter((g) => g.items.length > 0);
  const hasOther = allPackages.some((p) => !setOf(p));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Kitchen</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{packages.length} package{packages.length === 1 ? "" : "s"}{packages.length !== allPackages.length ? ` (of ${allPackages.length})` : ""}</p>
        </div>
        <Link href={`/kitchen/packages/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Package
        </Link>
      </div>

      <KitchenSubNav />

      {allPackages.length > 0 && (
        <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
          {requestedId && <input type="hidden" name="company" value={requestedId} />}
          {sets.length > 0 && (
            <label className="text-[12px] font-semibold text-text-secondary">
              Menu
              <Select name="set" defaultValue={activeSet ?? ""} className="mt-1 block h-9 w-44 rounded-lg border border-border-strong px-2 text-[13px]">
                <option value="">All menus</option>
                {sets.map((m) => <option key={m} value={m}>{m}</option>)}
                {hasOther && <option value="other">Other packages</option>}
              </Select>
            </label>
          )}
          <label className="min-w-[14rem] flex-1 text-[12px] font-semibold text-text-secondary">
            Search
            <input name="q" defaultValue={q ?? ""} placeholder="Package name, e.g. Week 1 or Menu 3" className="mt-1 block h-9 w-full max-w-md rounded-lg border border-border-strong px-3 text-[13px] outline-none focus:border-primary" />
          </label>
          <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white">Apply</button>
          {(activeSet || search) && (
            <Link href={`/kitchen/packages${query}`} className="flex h-9 items-center rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-text">Clear</Link>
          )}
        </form>
      )}

      {groups.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface shadow-sm">
          <EmptyRow text={allPackages.length === 0 ? "No package menus yet. Add one for a fixed-price bundle or a fixed daily menu." : "No package matches these filters."} />
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.key} className="rounded-xl border border-border bg-surface shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="text-[15px] font-extrabold text-text">{g.title}</div>
              <div className="text-xs font-semibold text-text-muted">{g.items.length} package{g.items.length === 1 ? "" : "s"}</div>
            </div>
            <div className="grid grid-cols-[2fr_0.8fr_1fr_1fr_0.8fr] border-b border-border bg-surface-alt px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Package</div>
              <div>Dishes</div>
              <div>{g.key === "other" ? "Price / pax" : "Recipe pax"}</div>
              <div>{g.key === "other" ? "Min. pax" : "Company"}</div>
              <div>Status</div>
            </div>
            {g.items.map((p) => (
              <Link
                key={p.id}
                href={`/kitchen/packages/${p.id}${query}`}
                className="grid grid-cols-[2fr_0.8fr_1fr_1fr_0.8fr] items-center border-b border-border px-5 py-3 text-[13.5px] last:border-b-0 hover:bg-surface-alt"
              >
                <div className="font-semibold text-text">{p.name}</div>
                <div className="text-text-secondary">{p.package_menu_items?.length ?? 0}</div>
                <div className="text-text-secondary">{g.key === "other" ? packagePriceLabel(p.price_per_pax) : `${p.minimum_pax} pax`}</div>
                <div className="text-text-secondary">{g.key === "other" ? p.minimum_pax : p.companies?.name}</div>
                <div>
                  <StatusBadge tone={p.is_active ? "success" : "warning"}>{p.is_active ? "Active" : "Inactive"}</StatusBadge>
                </div>
              </Link>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
