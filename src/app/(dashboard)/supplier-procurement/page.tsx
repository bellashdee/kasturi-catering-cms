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
import { ExportButtons } from "@/components/shared/ExportButtons";
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

  const records = await listSuppliers(supabase, targetCompanyIds, q);

  // The same supplier kept by several companies has one record per company (invoices and payments stay separate per company).
  // The list shows each supplier once, with every company that buys from it.
  type SupplierRecord = (typeof records)[number];
  const byName = new Map<string, SupplierRecord[]>();
  for (const r of records) {
    const key = r.name.toUpperCase().replace(/[^A-Z0-9]/g, "");
    byName.set(key, [...(byName.get(key) ?? []), r]);
  }
  const suppliers = Array.from(byName.values());
  const joined = (values: (string | null | undefined)[]) => Array.from(new Set(values.filter((v): v is string => !!v))).join(" / ") || "—";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-text">Supplier & Procurement</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            {suppliers.length} supplier{suppliers.length === 1 ? "" : "s"}
            {records.length !== suppliers.length ? ` (${records.length} company records)` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <ExportButtons
            table={{
              title: "Suppliers",
              subtitle: `${suppliers.length} supplier${suppliers.length === 1 ? "" : "s"}${q ? ` matching "${q}"` : ""}`,
              columns: ["Name", "Category", "Contact", "Phone", "Payment terms", "Company", "Status"],
              rows: suppliers.map((group) => [
                group[0].name,
                joined(group.map((g) => g.category)),
                joined(group.map((g) => g.contact_person)),
                joined(group.map((g) => g.phone)),
                joined(group.map((g) => g.payment_terms)),
                joined(group.map((g) => g.companies?.name)),
                Array.from(new Set(group.map((g) => SUPPLIER_STATUS_LABEL[g.status] ?? g.status))).join(" / "),
              ]),
              landscape: true,
            }}
          />
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
            {suppliers.map((group) => {
              const s = group[0];
              const statuses = Array.from(new Set(group.map((g) => g.status)));
              return (
                <Link
                  key={s.id}
                  href={`/supplier-procurement/${s.id}${query}`}
                  className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr_1fr] border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0 hover:bg-surface-alt"
                >
                  <div className="font-semibold text-text">{s.name}</div>
                  <div className="text-text-secondary">{joined(group.map((g) => g.category))}</div>
                  <div className="text-text-secondary">{joined(group.map((g) => g.contact_person ?? g.phone))}</div>
                  <div className="text-text-secondary">{joined(group.map((g) => g.payment_terms))}</div>
                  <div className="text-text-secondary">{joined(group.map((g) => g.companies?.name))}</div>
                  <div className="flex flex-wrap gap-1">
                    {statuses.map((st) => (
                      <StatusBadge key={st} tone={statusTone(st)}>{SUPPLIER_STATUS_LABEL[st] ?? st}</StatusBadge>
                    ))}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
