import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { resolveCompanyScope } from "@/lib/companyScope";
import { SoftHeader, SoftPage } from "@/components/ui/Soft";

// What a business owner looks at: how the business is doing, the money coming in and going out, and who still owes or is owed. Reports that
// showed the same thing are one card with a button for each view. (The Expense, Supplier Payment, Kitchen, Driver and HR reports are not
// listed here; their pages still open by address.)
type ReportCard = { key: string; title: string; description: string; links: { href: string; label: string }[] };
const REPORTS: ReportCard[] = [
  {
    key: "overview",
    title: "Business Overview",
    description: "Sales, costs, profit and what is still owed: one month, or the whole year with the top products, key customers and where the money went.",
    links: [
      { href: "/reports/company-summary", label: "This month" },
      { href: "/reports/performance", label: "Whole year" },
    ],
  },
  {
    key: "revenue",
    title: "Revenue",
    description: "Money received by month, and the invoices issued by Kasturi Indah, Signature Solution Catering and Signature Solution.",
    links: [{ href: "/reports/revenue", label: "Open" }],
  },
  {
    key: "costing",
    title: "Monthly Costing",
    description: "Every cost of the month grouped by category, against sales.",
    links: [{ href: "/reports/monthly-costing", label: "Open" }],
  },
  {
    key: "breakdown",
    title: "Monthly Breakdown",
    description: "Restoran Bara (O2 Life): sales, raw item cost, labour, utilities, contribution and net profit for every month, against each limit (Finance / Admin only).",
    links: [{ href: "/reports/monthly-breakdown", label: "Open" }],
  },
  {
    key: "events",
    title: "Event Report",
    description: "Every event with its revenue, costs, profit and margin, and whether the customer has paid.",
    links: [
      { href: "/catering/event-report", label: "Profit & loss" },
      { href: "/reports/event-summary", label: "Payment status" },
    ],
  },
  {
    key: "outstanding",
    title: "Outstanding",
    description: "Unpaid invoices: who still owes us, and who we still owe.",
    links: [
      { href: "/reports/customer-outstanding", label: "Customers owe us" },
      { href: "/reports/supplier-outstanding", label: "We owe suppliers" },
    ],
  },
  {
    key: "payments",
    title: "Finance Payments",
    description: "Supplier, rental and utilities payments by month: paid, pending and overdue (Finance / Admin only).",
    links: [{ href: "/reports/finance-payments", label: "Open" }],
  },
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
  const reports = REPORTS.filter((r) => onlyO2 || r.key !== "breakdown");

  return (
    <SoftPage>
      <SoftHeader title="Reports" subtitle="Real, live figures from every module — nothing here is hardcoded." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {reports.map((r) => (
          <div key={r.key} className="flex flex-col gap-1.5 rounded-3xl border border-border bg-surface p-5 shadow-sm">
            <Link href={`${r.links[0].href}${query}`} className="text-[14.5px] font-bold text-text hover:text-primary">{r.title}</Link>
            <div className="text-[12.5px] text-text-secondary">{r.description}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {r.links.map((l) => (
                <Link key={l.href} href={`${l.href}${query}`} className="rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-text hover:border-primary hover:text-primary">
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SoftPage>
  );
}
