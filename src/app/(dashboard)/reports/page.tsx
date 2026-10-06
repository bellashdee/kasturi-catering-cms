import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";

const REPORTS = [
  { href: "/reports/monthly-costing", title: "Monthly Costing Report", description: "Every cost across Catering, Kitchen, Supplier, Driver, Marketing and HR, grouped by category." },
  { href: "/reports/revenue", title: "Revenue Report", description: "Customer payments received, by month." },
  { href: "/reports/expenses", title: "Expense Report", description: "Every cost transaction, as a flat exportable list." },
  { href: "/reports/supplier-outstanding", title: "Supplier Outstanding Report", description: "Unpaid supplier invoices." },
  { href: "/reports/supplier-payments", title: "Supplier Payment Report", description: "Every supplier payment request and its status." },
  { href: "/reports/finance-payments", title: "Finance Payment Report", description: "Supplier, rental and utilities payments by month — paid, pending and overdue (Finance / Admin only)." },
  { href: "/reports/customer-outstanding", title: "Customer Outstanding Report", description: "Unpaid customer invoices." },
  { href: "/reports/catering", title: "Catering Report", description: "Events, revenue, cost and margin for the month." },
  { href: "/reports/kitchen", title: "Kitchen Report", description: "Production orders, ingredient cost and wastage." },
  { href: "/reports/driver", title: "Driver Report", description: "Deliveries and vehicle running costs." },
  { href: "/reports/hr", title: "HR Report", description: "Payroll by employee and department." },
  { href: "/reports/marketing", title: "Marketing Report", description: "Campaigns, channel and spend." },
  { href: "/reports/company-summary", title: "Company Summary", description: "One printable rollup of every module for a company and month." },
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

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-text">Reports</h1>
        <p className="mt-0.5 text-[13px] text-text-secondary">Real, live figures from every module — nothing here is hardcoded.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {REPORTS.map((r) => (
          <Link
            key={r.href}
            href={`${r.href}${query}`}
            className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-5 shadow-sm hover:border-primary"
          >
            <div className="text-[14.5px] font-bold text-text">{r.title}</div>
            <div className="text-[12.5px] text-text-secondary">{r.description}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
