import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { listCustomersWithHistory } from "@/lib/catering/queries";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { SearchBox } from "@/components/SearchBox";

export default async function CateringCustomersPage({
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

  const customers = await listCustomersWithHistory(supabase, targetCompanyIds, q);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/catering${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Events</Link>
          <h1 className="mt-1 text-[22px] font-extrabold text-text">Customer Database</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">{customers.length} customer{customers.length === 1 ? "" : "s"}</p>
        </div>
        <Link href={`/catering/customers/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + Add Customer
        </Link>
      </div>

      <SearchBox placeholder="Search customers by name..." />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {customers.length === 0 ? (
          <EmptyRow text="No customers yet." />
        ) : (
          <div className="divide-y divide-border">
            {customers.map((c) => (
              <Link key={c.id} href={`/catering/customers/${c.id}${query}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-surface-alt">
                <div>
                  <div className="text-[13.5px] font-semibold text-text">{c.name}</div>
                  <div className="mt-0.5 text-xs text-text-muted">
                    {c.contact_person && `${c.contact_person} · `}{c.phone || "No phone"}
                    {companies.length > 1 && c.companies?.name && ` · ${c.companies.name}`}
                  </div>
                </div>
                <div className="text-xs text-text-muted">{c.email || ""}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
