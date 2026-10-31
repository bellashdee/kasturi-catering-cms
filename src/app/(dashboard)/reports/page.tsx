import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { resolveCompanyScope } from "@/lib/companyScope";
import { SoftHeader, SoftPage } from "@/components/ui/Soft";

// What a business owner looks at: how the business is doing, the money coming in and going out, and who still owes or is owed.
// (The Expense, Supplier Payment, Kitchen, Driver and HR reports are no longer listed here; their pages still open by address.)
const REPORTS = [
  { href: "/reports/performance", title: "Performance Dashboard", description: "The year at a glance: top-selling products, key customers, who still owes us and where the money was spent." },
  { href: "/reports/company-summary", title: "Company Summary", description: "The whole business in one page for a month: sales, costs, profit and what is still owed." },
  { href: "/reports/revenue", title: "Revenue Report", description: "Money received by month, and the invoices issued by Kasturi Indah, Signature Solution Catering and Signature Solution." },
  { href: "/reports/monthly-costing", title: "Monthly Costing Report", description: "Every cost of the month grouped by category, against sales." },
  { href: "/reports/monthly-breakdown", title: "Monthly Breakdown", description: "Restoran Bara (O2 Life): sales, raw item cost, labour, utilities, contribution and net profit for every month, in RM and % of sales against each limit (Finance / Admin only)." },
  { href: "/reports/event-summary", title: "Event Summary Report", description: "Each event with its company, type of serving, revenue and payment status, by month (Finance / Admin only)." },
  { href: "/reports/catering", title: "Catering Report", description: "Events, revenue, cost and margin for the month." },
  { href: "/reports/customer-outstanding", title: "Customer Outstanding Report", description: "Unpaid customer invoices: who still owes us." },
  { href: "/reports/supplier-outstanding", title: "Supplier Outstanding Report", description: "Unpaid supplier invoices: who we still owe." },
  { href: "/reports/finance-payments", title: "Finance Payment Report", description: "Supplier, rental and utilities payments by month: paid, pending and overdue (Finance / Admin only)." },
];

export default async function ReportsHubPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const { company: requestedId } = await searchParams;
  const query = requestedId ? `?company=${requestedId}` : "";
  const supabase = await createClient();
  // the Monthly Breakdown is for O2 Life only: listed only while O2 Life is the chosen company
  const { data: companies } = await supabase.from("companies").select("id, name");
  const { targetCompanyIds } = resolveCompanyScope(session, companies ?? [], requestedId);
  const o2 = (companies ?? []).find((c) => c.name === "O2 Life");
  const onlyO2 = !!o2 && targetCompanyIds.length === 1 && targetCompanyIds[0] === o2.id;
  const reports = REPORTS.filter((r) => onlyO2 || r.href !== "/reports/monthly-breakdown");

  return (
    <SoftPage>
      <SoftHeader title="Reports" subtitle="Real, live figures from every module — nothing here is hardcoded." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {reports.map((r) => (
          <Link
            key={r.href}
            href={`${r.href}${query}`}
            className="flex flex-col gap-1.5 rounded-3xl border border-border bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary"
          >
            <div className="text-[14.5px] font-bold text-text">{r.title}</div>
            <div className="text-[12.5px] text-text-secondary">{r.description}</div>
          </Link>
        ))}
      </div>
    </SoftPage>
  );
}
