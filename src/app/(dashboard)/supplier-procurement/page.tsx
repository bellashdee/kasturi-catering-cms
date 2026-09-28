import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listSuppliers } from "@/lib/procurement/queries";
import { SUPPLIER_STATUS_LABEL } from "@/lib/procurement/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { SearchBox } from "@/components/SearchBox";
import { SupplierProcurementSubNav } from "@/components/procurement/SupplierProcurementSubNav";

function statusTone(status: string): "success" | "neutral" | "danger" {
  if (status === "active") return "success";
  if (status === "blacklisted") return "danger";
  return "neutral";
}

export default async function SupplierProcurementPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; q?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const { company: requestedId, q } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const suppliers = await listSuppliers(supabase, targetCompanyIds, q);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Supplier & Procurement</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{suppliers.length} supplier{suppliers.length === 1 ? "" : "s"}</p>
        </div>
        <div className="flex gap-2.5">
          <Link href={`/supplier-procurement/import${query}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13px] font-semibold text-text">
            Import Excel/CSV
          </Link>
          <Link href={`/supplier-procurement/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
            + New Supplier
          </Link>
        </div>
      </div>

      <SupplierProcurementSubNav />
      <SearchBox placeholder="Search suppliers by name..." />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {suppliers.length === 0 ? (
          <EmptyRow text="No suppliers yet. Add one manually or import from Excel/CSV." />
        ) : (
          <div>
            <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr_1fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Name</div>
              <div>Category</div>
              <div>Contact</div>
              <div>Payment Terms</div>
              <div>Company</div>
              <div>Status</div>
            </div>
            {suppliers.map((s) => (
              <Link
                key={s.id}
                href={`/supplier-procurement/${s.id}${query}`}
                className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr_1fr] border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0 hover:bg-surface-alt"
              >
                <div className="font-semibold text-text">{s.name}</div>
                <div className="text-text-secondary">{s.category ?? "—"}</div>
                <div className="text-text-secondary">{s.contact_person ?? s.phone ?? "—"}</div>
                <div className="text-text-secondary">{s.payment_terms ?? "—"}</div>
                <div className="text-text-secondary">{s.companies?.name}</div>
                <div>
                  <StatusBadge tone={statusTone(s.status)}>{SUPPLIER_STATUS_LABEL[s.status] ?? s.status}</StatusBadge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
