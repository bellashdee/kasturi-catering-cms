import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { certificateUrgency } from "@/lib/hr/constants";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { CompanyDocumentList } from "@/components/hr/CompanyDocumentList";
import { getHrAccess } from "@/lib/hr/access";

export default async function CompanyDocumentsPage({
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
  if (!(await getHrAccess(supabase, session, targetCompanyIds)).adminAnywhere) redirect("/hr");
  const query = requestedId ? `?company=${requestedId}` : "";

  if (targetCompanyIds.length === 0) {
    return <EmptyRow text="You don't have access to any company yet." />;
  }

  const { data, error } = await supabase
    .from("company_documents")
    .select("*, companies(name)")
    .in("company_id", targetCompanyIds);
  if (error) throw error;
  // by company, then by title (the titles start with the LIC number)
  const docs = [...(data ?? [])].sort((a, b) => (a.companies?.name ?? "").localeCompare(b.companies?.name ?? "") || a.title.localeCompare(b.title));

  const expired = docs.filter((d) => certificateUrgency(d.expiry_date) === "expired").length;
  const soon = docs.filter((d) => certificateUrgency(d.expiry_date) === "expiring_soon").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/hr${query}`} className="text-[12.5px] font-semibold text-text-secondary">
            ← Back to HR
          </Link>
          <h1 className="mt-2 text-[22px] font-extrabold text-text">Licences &amp; Documents</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            Licences, registrations (MBJB, Halal, MOF, SSM, FoSIM), tenancy agreements and similar — {docs.length} document{docs.length === 1 ? "" : "s"}
            {expired > 0 && <span className="ml-2 font-semibold text-danger">{expired} expired</span>}
            {soon > 0 && <span className="ml-2 font-semibold text-warning">{soon} expiring within 30 days</span>}
          </p>
        </div>
        <Link href={`/hr/documents/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + Add Document
        </Link>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface shadow-sm">
          <EmptyRow text="No licences or agreements recorded yet. Upload an MBJB licence, Halal licence or tenancy agreement and the system will remind you before it expires." />
        </div>
      ) : (
        <CompanyDocumentList
          docs={docs.map((d) => ({ id: d.id, companyId: d.company_id, companyName: d.companies?.name ?? "", docType: d.doc_type, title: d.title, referenceNumber: d.reference_number, issuedDate: d.issued_date, expiryDate: d.expiry_date, notes: d.notes, documentId: d.document_id, urgency: certificateUrgency(d.expiry_date) }))}
        />
      )}
    </div>
  );
}
