import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { COMPANY_DOC_TYPE_LABEL, certificateUrgency } from "@/lib/hr/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { DocumentViewLink } from "@/components/shared/DocumentViewLink";
import { DeleteCompanyDocumentButton } from "@/components/hr/DeleteCompanyDocumentButton";
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
    .in("company_id", targetCompanyIds)
    .order("expiry_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  const docs = data ?? [];

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
            MBJB licence, Halal licence, tenancy agreements and similar — {docs.length} document{docs.length === 1 ? "" : "s"}
            {expired > 0 && <span className="ml-2 font-semibold text-danger">{expired} expired</span>}
            {soon > 0 && <span className="ml-2 font-semibold text-warning">{soon} expiring within 30 days</span>}
          </p>
        </div>
        <Link href={`/hr/documents/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + Add Document
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        {docs.length === 0 ? (
          <EmptyRow text="No licences or agreements recorded yet. Upload an MBJB licence, Halal licence or tenancy agreement and the system will remind you before it expires." />
        ) : (
          <div>
            <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr_0.9fr] border-b border-border bg-surface-alt px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <div>Document</div>
              <div>Type</div>
              <div>Company</div>
              <div>Reference</div>
              <div>Expires</div>
              <div></div>
            </div>
            {docs.map((d) => {
              const urgency = certificateUrgency(d.expiry_date);
              return (
                <div key={d.id} className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr_0.9fr] items-center border-b border-border px-5 py-3.5 text-[13.5px] last:border-b-0">
                  <div className="font-semibold text-text">
                    {d.title}
                    {d.document_id && <DocumentViewLink documentId={d.document_id} className="ml-2 text-xs" />}
                  </div>
                  <div className="text-text-secondary">{COMPANY_DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type}</div>
                  <div className="text-text-secondary">{d.companies?.name}</div>
                  <div className="text-text-secondary">{d.reference_number ?? "—"}</div>
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-text-secondary">{d.expiry_date ?? "—"}</span>
                    {urgency === "expired" && <StatusBadge tone="danger">Expired</StatusBadge>}
                    {urgency === "expiring_soon" && <StatusBadge tone="warning">Expiring soon</StatusBadge>}
                    {urgency === "valid" && <StatusBadge tone="success">Valid</StatusBadge>}
                  </div>
                  <div className="flex justify-end">
                    <DeleteCompanyDocumentButton id={d.id} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
