import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { adminCompanyIds, listPaymentAccounts } from "@/lib/finance/paymentQueries";
import { PAYMENT_CATEGORY_LABEL, isRentalUtilityCompany, type PaymentCategory, type UtilityType } from "@/lib/finance/payments";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { FinanceAdminSubNav } from "@/components/finance/FinanceAdminSubNav";
import { AccountsManager, type AccountRow } from "@/components/finance/AccountsManager";

const CATEGORIES: PaymentCategory[] = ["supplier", "rental", "utility"];

/** Reference list of suppliers, rental payees and utility accounts, with their bank / account details. Finance / Admin only. */
export default async function PaymentAccountsPage({ searchParams }: { searchParams: Promise<{ company?: string; category?: string }> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const category = (CATEGORIES.includes(sp.category as PaymentCategory) ? sp.category : "supplier") as PaymentCategory;
  const { targetCompanyIds } = resolveCompanyScope(session, companies, sp.company);
  const adminIds = await adminCompanyIds(supabase, targetCompanyIds, "finance-admin");
  const query = sp.company ? `&company=${sp.company}` : "";

  const header = (
    <>
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Admin &amp; Finance</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Payment accounts — suppliers, rental payees and utility accounts (bank details are restricted to Finance / Admin)</p>
      </div>
      <FinanceAdminSubNav />
    </>
  );

  if (adminIds.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <EmptyRow text="Bank and account details are only available to Finance / Admin users of the company." />
      </div>
    );
  }

  const allowedCompanies = companies.filter((c) => adminIds.includes(c.id) && (category === "supplier" || isRentalUtilityCompany(c.name)));
  const rows = await listPaymentAccounts(supabase, adminIds, category, true);
  const all: AccountRow[] = rows.map((a) => ({
    id: a.id,
    companyId: a.company_id,
    companyName: a.companies?.name ?? "",
    category: a.category as PaymentCategory,
    name: a.name,
    provider: a.provider,
    utilityType: a.utility_type as UtilityType | null,
    bankName: a.bank_name,
    accountNo: a.account_no,
    defaultDueDay: a.default_due_day,
    notes: a.notes,
    isActive: a.is_active,
  }));
  // a supplier is the same supplier in every company: one row each (the first company's details; an edit changes them all)
  const key = (name: string) => name.trim().replace(/\s+/g, " ").toUpperCase();
  const accounts: AccountRow[] =
    category === "supplier"
      ? Array.from(
          all
            .reduce((map, a) => {
              const k = key(a.name);
              const first = map.get(k);
              if (first) first.companyNames = [...(first.companyNames ?? []), a.companyName];
              else map.set(k, { ...a, name: k, companyNames: [a.companyName] });
              return map;
            }, new Map<string, AccountRow>())
            .values(),
        ).sort((a, b) => a.name.localeCompare(b.name))
      : all;

  return (
    <div className="flex flex-col gap-5">
      {header}
      <div className="flex gap-1 border-b border-border">
        {CATEGORIES.map((c) => (
          <Link
            key={c}
            href={`/finance/payment-accounts?category=${c}${query}`}
            className={`border-b-2 px-3.5 py-2.5 text-[13.5px] font-semibold ${category === c ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text"}`}
          >
            {c === "supplier" ? "Suppliers" : c === "rental" ? "Rental Payees" : "Utility Accounts"}
          </Link>
        ))}
      </div>
      <p className="text-[12.5px] text-text-secondary">{PAYMENT_CATEGORY_LABEL[category]} reference list. Account numbers are shown exactly as recorded; a blank account shows as &quot;Not Available&quot;. Every change to bank details is recorded in the audit trail.</p>
      <AccountsManager category={category} companies={allowedCompanies} accounts={accounts} />
    </div>
  );
}
