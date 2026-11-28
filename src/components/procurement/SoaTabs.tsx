"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTabVisible } from "@/components/layout/SectionAccess";

/** The pages of SOA in the order of the work: the monthly report, the statements with ageing, then the reconciliation with the supplier's own SOA. */
const TABS = [
  { href: "/supplier-procurement/soa", label: "SOA Report", match: (p: string) => p === "/supplier-procurement/soa" },
  { href: "/supplier-procurement/soa/statements", label: "Statements & ageing", match: (p: string) => p.startsWith("/supplier-procurement/soa/statements") || /^\/supplier-procurement\/soa\/[0-9a-f-]{36}/.test(p) },
  { href: "/supplier-procurement/soa/reconcile", label: "SOA Reconciliation", match: (p: string) => p.startsWith("/supplier-procurement/soa/reconcile") },
];

export function SoaTabs() {
  const pathname = usePathname();
  const company = useSearchParams().get("company");
  const visible = useTabVisible();
  return (
    <nav className="flex flex-wrap gap-1.5 print:hidden" aria-label="SOA pages">
      {TABS.filter((t) => visible(t.href)).map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={company ? `${t.href}?company=${company}` : t.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${active ? "border-primary bg-primary text-white" : "border-border bg-surface text-text-secondary hover:text-text"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
