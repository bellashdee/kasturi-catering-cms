import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { CompanyDocumentUploadReview } from "@/components/hr/CompanyDocumentUploadReview";

export default async function NewCompanyDocumentPage({
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
  const query = requestedId ? `?company=${requestedId}` : "";

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[22px] font-extrabold text-text">Add Licence / Document</h1>
      <p className="mt-1 text-[13px] text-text-secondary">MBJB licence, Halal licence, tenancy agreement or similar. Upload the file (or key it in) and set the expiry date.</p>
      <div className="mt-5 rounded-xl border border-border bg-surface shadow-sm">
        <CompanyDocumentUploadReview companies={selectable} defaultCompanyId={defaultCompanyId} redirectTo={`/hr/documents${query}`} />
      </div>
    </div>
  );
}
