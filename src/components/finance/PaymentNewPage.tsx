import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { resolveCompanyScope } from "@/lib/companyScope";
import { adminCompanyIds, listPaymentAccounts } from "@/lib/finance/paymentQueries";
import { PAYMENT_CATEGORY_LABEL, RENTAL_UTILITY_COMPANY_NAME, type PaymentCategory, type UtilityType } from "@/lib/finance/payments";
import { malaysiaMonthNow } from "@/lib/driverAttendance/date";
import { EmptyRow } from "@/components/dashboard/SectionCard";
import { PaymentForm } from "@/components/finance/PaymentForm";

type SearchParams = { company?: string; year?: string; month?: string; account?: string };

const PATH: Record<PaymentCategory, string> = {
  supplier: "/finance/supplier-payment",
  rental: "/finance/rental-payment",
  utility: "/finance/utilities-payment",
};

/** New payment page: upload a file (or key in), review, confirm. Rental and utilities are for Signature Solution only. */
export async function PaymentNewPage({ category, searchParams }: { category: PaymentCategory; searchParams: Promise<SearchParams> }) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = allCompanies ?? [];

  const sp = await searchParams;
  const { accessibleIds } = resolveCompanyScope(session, companies, sp.company);
  const adminIds = await adminCompanyIds(supabase, accessibleIds);
  let selectable = companies.filter((c) => adminIds.includes(c.id));
  if (category !== "supplier") selectable = selectable.filter((c) => c.name === RENTAL_UTILITY_COMPANY_NAME);

  const title = PAYMENT_CATEGORY_LABEL[category];
  const query = sp.company ? `?company=${sp.company}` : "";

  if (selectable.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyRow text={category === "supplier" ? "Only Finance / Admin users can record payments." : `${title} is for ${RENTAL_UTILITY_COMPANY_NAME} and is only available to its Finance / Admin users.`} />
      </div>
    );
  }

  const accountRows = await listPaymentAccounts(supabase, selectable.map((c) => c.id), category);
  const accounts = accountRows.map((a) => ({
    id: a.id,
    companyId: a.company_id,
    category: a.category as PaymentCategory,
    name: a.name,
    provider: a.provider,
    utilityType: a.utility_type as UtilityType | null,
    bankName: a.bank_name,
    accountNo: a.account_no,
    defaultDueDay: a.default_due_day,
  }));

  const now = malaysiaMonthNow();
  const year = Number(sp.year) || now.year;
  const month = Number(sp.month) || now.month;
  const defaultCompanyId = sp.company && selectable.some((c) => c.id === sp.company) ? sp.company : selectable[0]?.id;
  const redirectTo = `${PATH[category]}${query}${query ? "&" : "?"}year=${year}&month=${month}`;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`${PATH[category]}${query}`} className="text-[12.5px] font-semibold text-text-secondary">← Back to {title}</Link>
      <h1 className="mt-2 text-[22px] font-extrabold text-text">New {title}</h1>
      <div className="mt-5 rounded-xl border border-border bg-surface shadow-sm">
        <PaymentForm
          category={category}
          companies={selectable}
          defaultCompanyId={defaultCompanyId}
          accounts={accounts}
          initialYear={year}
          initialMonth={month}
          prefillAccountId={sp.account}
          redirectTo={redirectTo}
        />
      </div>
    </div>
  );
}
