import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { FinanceAdminSubNav } from "@/components/finance/FinanceAdminSubNav";
import { ReceiptPdfImport } from "@/components/finance/ReceiptPdfImport";

export default async function ReceivePaymentsPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];
  const { company: requestedId } = await searchParams;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, requestedId);
  if (targetCompanyIds.length === 0) return <EmptyRow text="You don't have access to any company yet." />;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Admin &amp; Finance</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">
          Record the payments received from customers by uploading the receipt listing printed from AutoCount, instead of keying each one. Each payment is recorded on its customer invoice.
        </p>
      </div>
      <FinanceAdminSubNav />
      <ReceiptPdfImport companies={companies.filter((c) => targetCompanyIds.includes(c.id))} />
    </div>
  );
}
