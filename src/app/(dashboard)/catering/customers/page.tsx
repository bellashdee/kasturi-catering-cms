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

  const records = await listCustomersWithHistory(supabase, targetCompanyIds, q);

  // The same customer kept by several companies has one record per company (events, quotations and invoices stay separate per company).
  // The list shows each customer once, with every company.
  type CustomerRecord = (typeof records)[number];
  const byName = new Map<string, CustomerRecord[]>();
  for (const r of records) {
    const key = r.name.toUpperCase().replace(/[^A-Z0-9]/g, "");
    byName.set(key, [...(byName.get(key) ?? []), r]);
  }
  const customers = Array.from(byName.values());
  const { count: pendingCount } = await supabase
    .from("customer_intake_submissions")
    .select("id", { count: "exact", head: true })
    .in("company_id", targetCompanyIds)
    .eq("status", "pending");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/catering${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to Events</Link>
          <h1 className="mt-1 text-[22px] font-extrabold text-text">Customer Database</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            {customers.length} customer{customers.length === 1 ? "" : "s"}
            {records.length !== customers.length ? ` (${records.length} company records)` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/catering/customers/submissions${query}`} className="rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-[13px] font-semibold text-text">
            Submissions{pendingCount ? ` (${pendingCount})` : ""}
          </Link>
          <Link href={`/catering/customers/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
            + Add Customer
          </Link>
        </div>
      </div>

      <SearchBox placeholder="Search customers by name..." />

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {customers.length === 0 ? (
          <EmptyRow text="No customers yet." />
        ) : (
          <div className="divide-y divide-border">
            {customers.map((group) => {
              const c = group[0];
              const pick = (get: (g: CustomerRecord) => string | null | undefined) => group.map(get).find((v) => !!v) ?? null;
              const companyNames = Array.from(new Set(group.map((g) => g.companies?.name).filter((n): n is string => !!n)));
              const contact = pick((g) => g.contact_person);
              return (
                <Link key={c.id} href={`/catering/customers/${c.id}${query}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-surface-alt">
                  <div>
                    <div className="text-[13.5px] font-semibold text-text">{c.name}</div>
                    <div className="mt-0.5 text-xs text-text-muted">
                      {contact && `${contact} · `}{pick((g) => g.phone) || "No phone"}
                      {companies.length > 1 && companyNames.length > 0 && ` · ${companyNames.join(" / ")}`}
                    </div>
                  </div>
                  <div className="text-xs text-text-muted">{pick((g) => g.email) || ""}</div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
