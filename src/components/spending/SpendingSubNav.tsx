"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const TABS = [
  { href: "/spending/expenses", label: "Company Expenses", finance: true, match: (p: string) => p.startsWith("/spending/expenses") },
  { href: "/spending/petty-cash", label: "Petty Cash", finance: false, match: (p: string) => p === "/spending/petty-cash" },
  { href: "/spending/petty-cash/claims", label: "Petty Cash Claims", finance: false, match: (p: string) => p.startsWith("/spending/petty-cash/claims") },
  { href: "/spending/budgets", label: "Budgets", finance: true, match: (p: string) => p.startsWith("/spending/budgets") },
];

/**
 * Company Spending: Company Expenses, Petty Cash (the cash book and the claims) and Budgets in one place. A person who only holds a
 * petty cash (no Admin & Finance access) sees just the petty cash tabs.
 */
export function SpendingSubNav({ hideFinance = false }: { hideFinance?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const company = searchParams.get("company");
  return (
    <div className="flex flex-wrap gap-1 border-b border-border">
      {TABS.filter((t) => !(hideFinance && t.finance)).map((tab) => (
        <Link
          key={tab.href}
          href={company ? `${tab.href}?company=${company}` : tab.href}
          className={`border-b-2 px-3.5 py-2.5 text-[13.5px] font-semibold ${tab.match(pathname) ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text"}`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
