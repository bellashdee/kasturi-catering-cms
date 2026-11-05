import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { SupplierNoteForm } from "@/components/procurement/SupplierNoteForm";
import { getItemSuggestions } from "@/lib/procurement/itemSuggestions";

export default async function NewSupplierNotePage({ searchParams }: { searchParams: Promise<{ company?: string; type?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];

  const { company: requestedId, type } = await searchParams;
  const noteType = type === "debit" ? "debit" : "credit";
  const { accessibleIds } = resolveCompanyScope(session, companies, requestedId);
  const selectable = companies.filter((c) => accessibleIds.includes(c.id));
  const defaultCompanyId = requestedId && accessibleIds.includes(requestedId) ? requestedId : selectable[0]?.id;

  const [{ data: suppliers }, { data: invoices }, suggestions] = await Promise.all([
    supabase.from("suppliers").select("id, name, company_id").in("company_id", accessibleIds).order("name"),
    supabase.from("supplier_invoices").select("id, invoice_number, supplier_id, company_id").in("company_id", accessibleIds).order("invoice_date", { ascending: false }).limit(1000),
    getItemSuggestions(supabase, accessibleIds),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-[22px] font-extrabold text-text">New {noteType === "credit" ? "Credit" : "Debit"} Note</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <SupplierNoteForm
          noteType={noteType}
          companies={selectable}
          defaultCompanyId={defaultCompanyId}
          suppliers={suppliers ?? []}
          invoices={(invoices ?? []).map((i) => ({ id: i.id, invoiceNumber: i.invoice_number, supplierId: i.supplier_id, companyId: i.company_id }))}
          suggestions={suggestions}
        />
      </div>
    </div>
  );
}
