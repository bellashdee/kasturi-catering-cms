"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { todayInMalaysia } from "@/lib/format";

const buttonClass = "h-9 rounded-lg border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-text hover:bg-surface-alt disabled:opacity-50";

/** Pages whose records come from an uploaded file: where "Import" goes (a supplier invoice upload reads PDF, Excel, CSV and photos). */
const IMPORT_TARGETS: [prefix: string, href: string][] = [
  ["/supplier-procurement/invoices", "/supplier-procurement/invoices/new"],
  ["/supplier-procurement/items", "/supplier-procurement/invoices/new"],
  ["/supplier-procurement/payments", "/supplier-procurement/invoices/new"],
  ["/supplier-procurement/orders", "/supplier-procurement/invoices/new"],
  ["/supplier-procurement/requests", "/supplier-procurement/invoices/new"],
];

type Sheet = { name: string; rows: string[][] };

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** Every table on the page as rows of text (what the user sees), skipping tables inside the side bar and the tool bar. */
function readTables(root: HTMLElement): Sheet[] {
  const sheets: Sheet[] = [];
  root.querySelectorAll("table").forEach((table, i) => {
    if (table.closest("[data-page-tools]")) return;
    const rows = [...table.querySelectorAll("tr")]
      .map((tr) => [...tr.querySelectorAll("th,td")].map((c) => clean(c.textContent)))
      .filter((r) => r.some((c) => c !== ""));
    if (rows.length < 2) return;
    const heading = table.closest("section")?.querySelector("h2,h3")?.textContent;
    sheets.push({ name: clean(heading) || `Table ${i + 1}`, rows });
  });
  return sheets;
}

/**
 * "Export Excel" and "Print" on every page that shows a table. The tables are read from the page itself,
 * so a list needs no code of its own. Pages that already have their own Export Excel button are left alone.
 */
export function PageTools() {
  const pathname = usePathname();
  const company = useSearchParams().get("company");
  const [state, setState] = useState<"none" | "show">("none");
  const target = IMPORT_TARGETS.find(([prefix]) => pathname === prefix)?.[1];
  const importHref = target ? `${target}${company ? `?company=${company}` : ""}` : null;
  const [hasOwnImport, setHasOwnImport] = useState(false);

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const check = () => {
      const hasOwn = [...main.querySelectorAll("button")].some((b) => !b.closest("[data-page-tools]") && /export excel/i.test(b.textContent ?? ""));
      setHasOwnImport([...main.querySelectorAll("a,button")].some((b) => !b.closest("[data-page-tools]") && /^\s*import/i.test(b.textContent ?? "")));
      setState(!hasOwn && readTables(main).length > 0 ? "show" : "none");
    };
    check();
    // pages stream in and lists re-render when filtered: look again whenever the page changes
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(check, 300);
    });
    let timer = 0;
    observer.observe(main, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [pathname]);

  const showImport = importHref && !hasOwnImport;
  if (state === "none" && !showImport) return null;

  async function excel() {
    const main = document.querySelector("main");
    if (!main) return;
    const sheets = readTables(main);
    if (sheets.length === 0) return;
    const XLSX = await import("xlsx");
    const book = XLSX.utils.book_new();
    const used = new Set<string>();
    sheets.forEach((s, i) => {
      let name = s.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 28) || `Sheet${i + 1}`;
      while (used.has(name.toLowerCase())) name = `${name.slice(0, 25)} ${used.size + 1}`;
      used.add(name.toLowerCase());
      const sheet = XLSX.utils.aoa_to_sheet(s.rows);
      const cols = Math.max(...s.rows.map((r) => r.length));
      sheet["!cols"] = Array.from({ length: cols }, (_, c) => ({ wch: Math.min(60, Math.max(...s.rows.map((r) => (r[c] ?? "").length)) + 2) }));
      XLSX.utils.book_append_sheet(book, sheet, name);
    });
    const page = pathname.replace(/^\/|\/$/g, "").replace(/[^A-Za-z0-9]+/g, "-") || "dashboard";
    XLSX.writeFile(book, `${page}-${todayInMalaysia()}.xlsx`);
  }

  return (
    <div data-page-tools className="mb-4 flex justify-end gap-2 print:hidden">
      {state === "show" && (
        <>
          <button type="button" onClick={excel} className={buttonClass}>
            Export Excel
          </button>
          <button type="button" onClick={() => window.print()} className={buttonClass}>
            Print
          </button>
        </>
      )}
      {showImport && (
        <Link href={importHref} className={`${buttonClass} inline-flex items-center`}>
          Import Excel/CSV/PDF
        </Link>
      )}
    </div>
  );
}
