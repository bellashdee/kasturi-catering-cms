"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const TABS = [
  { href: "/spending/petty-cash", label: "Petty Cash", finance: false, pettyCash: true, match: (p: string) => p.startsWith("/spending/petty-cash") },
  // every staff member sends their own claim here
  { href: "/spending/my-claims", label: "My Claims", finance: false, pettyCash: false, match: (p: string) => p.startsWith("/spending/my-claims") },
  { href: "/spending/expenses", label: "Company Expenses", finance: true, match: (p: string) => p.startsWith("/spending/expenses") },
  { href: "/spending/budgets", label: "Budgets", finance: true, match: (p: string) => p.startsWith("/spending/budgets") },
];

/**
 * Company Spending: Company Expenses, Petty Cash (money received, spent and the staff claims, all in one page) and Budgets in one place. A person who only holds a
 * petty cash (no Admin & Finance access) sees just the petty cash tabs.
 */
export function SpendingSubNav({ hideFinance = false, hidePettyCash = false }: { hideFinance?: boolean; hidePettyCash?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const company = searchParams.get("company");
  return (
    <div className="flex flex-wrap gap-1 border-b border-border">
      {TABS.filter((t) => !(hideFinance && t.finance) && !(hidePettyCash && t.pettyCash)).map((tab) => (
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
