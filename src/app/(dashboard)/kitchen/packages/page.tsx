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

export default async function PackageMenusPage({
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

  const packages = await listPackageMenus(supabase, targetCompanyIds);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Kitchen</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{packages.length} package{packages.length === 1 ? "" : "s"}</p>
        </div>
        <Link href={`/kitchen/packages/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + New Package
        </Link>
      </div>

      <KitchenSubNav />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {packages.length === 0 ? (
          <EmptyRow text="No package menus yet. Create one to offer a fixed-price bundle for Catering orders." />
        ) : (
          <div>
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_0.8fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Package</div>
              <div>Price / Pax</div>
              <div>Min Pax</div>
              <div>Company</div>
              <div>Status</div>
            </div>
            {packages.map((p) => (
              <Link
                key={p.id}
                href={`/kitchen/packages/${p.id}${query}`}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_0.8fr] items-center border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0 hover:bg-surface-alt"
              >
                <div className="font-semibold text-text">{p.name}</div>
                <div className="text-text-secondary">{packagePriceLabel(p.price_per_pax)}</div>
                <div className="text-text-secondary">{p.minimum_pax}</div>
                <div className="text-text-secondary">{p.companies?.name}</div>
                <div>
                  <StatusBadge tone={p.is_active ? "success" : "warning"}>{p.is_active ? "Active" : "Inactive"}</StatusBadge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
