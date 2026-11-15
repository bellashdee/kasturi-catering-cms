import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { certificateUrgency, COMPANY_DOC_TYPE_LABEL } from "@/lib/hr/constants";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { CompanyDocumentList } from "@/components/hr/CompanyDocumentList";
import { getHrAccess } from "@/lib/hr/access";
import { MonthFilter } from "@/components/MonthFilter";
import { filterByMonth, monthLabelOf } from "@/lib/monthFilter";
import { Select } from "@/components/ui/Select";
import { FILTER_INPUT, FilterField, ListFilters } from "@/components/shared/ListFilters";
import { readSort, sortBy } from "@/lib/listSort";

type SearchParams = { company?: string; month?: string; q?: string; type?: string; status?: string; sort?: string; dir?: string };

const SORTS = { company: "Company", document: "Document", type: "Type", reference: "Reference", expiry: "Expiry date" };

const STATUS_LABEL: Record<string, string> = {
  valid: "Valid",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  no_expiry: "No expiry",
};

export default async function CompanyDocumentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { company: requestedId, month } = sp;
  const { accessibleIds, targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
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
  // the month is the month the licence or document expires in
  const inMonth = filterByMonth([...(data ?? [])], month, (d) => d.expiry_date).map((d) => ({
    id: d.id,
    companyId: d.company_id,
    companyName: d.companies?.name ?? "",
    docType: d.doc_type,
    title: d.title,
    referenceNumber: d.reference_number,
    issuedDate: d.issued_date,
    expiryDate: d.expiry_date,
    notes: d.notes,
    documentId: d.document_id,
    urgency: certificateUrgency(d.expiry_date),
  }));

  const q = sp.q?.trim().toLowerCase() ?? "";
  const filtered = inMonth.filter(
    (d) =>
      (!sp.type || d.docType === sp.type) &&
      (!sp.status || d.urgency === sp.status) &&
      (!q || [d.title, d.referenceNumber, d.notes].some((x) => x?.toLowerCase().includes(q))),
  );
  // by company, then by title (the titles start with the LIC number)
  const { sort, dir } = readSort(sp, SORTS, "company", "asc");
  const docs = sortBy(filtered, sort, dir, {
    company: [(d) => d.companyName, (d) => d.title],
    document: (d) => d.title,
    type: [(d) => COMPANY_DOC_TYPE_LABEL[d.docType] ?? d.docType, (d) => d.title],
    reference: [(d) => d.referenceNumber, (d) => d.title],
    expiry: [(d) => d.expiryDate, (d) => d.title],
  });
  const filterNote = [
    sp.type ? (COMPANY_DOC_TYPE_LABEL[sp.type] ?? sp.type) : null,
    sp.status ? STATUS_LABEL[sp.status] : null,
    sp.q?.trim() ? `search: ${sp.q.trim()}` : null,
  ].filter(Boolean).join(" | ");

  const monthLabel = monthLabelOf(month);
  const expired = inMonth.filter((d) => d.urgency === "expired").length;
  const soon = inMonth.filter((d) => d.urgency === "expiring_soon").length;
  const types = Array.from(new Set(inMonth.map((d) => d.docType)));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/hr${query}`} className="text-[12.5px] font-semibold text-text-secondary">
            ← Back to HR
          </Link>
          <h1 className="mt-2 text-[22px] font-extrabold text-text">Licences &amp; Documents</h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            Licences, registrations (MBJB, Halal, MOF, SSM, FoSIM), tenancy agreements and similar · {inMonth.length} document{inMonth.length === 1 ? "" : "s"}
            {monthLabel && <span className="ml-2 font-semibold text-text">expiring in {monthLabel}</span>}
            {expired > 0 && <span className="ml-2 font-semibold text-danger">{expired} expired</span>}
            {soon > 0 && <span className="ml-2 font-semibold text-warning">{soon} expiring within 30 days</span>}
          </p>
        </div>
        <Link href={`/hr/documents/new${query}`} className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-white">
          + Add Document
        </Link>
      </div>

      <MonthFilter />

      <ListFilters keep={{ month }} sortOptions={SORTS} sort={sort} dir={dir} clearHref={`/hr/documents${query}${month ? `${query ? "&" : "?"}month=${month}` : ""}`}>
        <FilterField label="Search">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Title, reference or notes" className={`${FILTER_INPUT} w-52`} />
        </FilterField>
        {accessibleIds.length > 1 && (
          <FilterField label="Company">
            <Select name="company" defaultValue={requestedId ?? ""} className={`${FILTER_INPUT} w-48`}>
              <option value="">All companies</option>
              {companies.filter((c) => accessibleIds.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FilterField>
        )}
        <FilterField label="Type">
          <Select name="type" defaultValue={sp.type ?? ""} className={`${FILTER_INPUT} w-56`}>
            <option value="">All types</option>
            {types.map((t) => <option key={t} value={t}>{COMPANY_DOC_TYPE_LABEL[t] ?? t}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Status">
          <Select name="status" defaultValue={sp.status ?? ""} className={`${FILTER_INPUT} w-40`}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </FilterField>
      </ListFilters>

      {inMonth.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface shadow-sm">
          <EmptyRow text={monthLabel ? "No licences or documents expire in this month." : "No licences or agreements recorded yet. Upload an MBJB licence, Halal licence or tenancy agreement and the system will remind you before it expires."} />
        </div>
      ) : (
        <CompanyDocumentList docs={docs} total={inMonth.length} filterNote={filterNote} />
      )}
    </div>
  );
}
