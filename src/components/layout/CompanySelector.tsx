"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ALL_COMPANIES_OPTION, COMPANY_STYLE } from "@/lib/constants";

type Company = { id: string; name: string; legal_name: string };

export function CompanySelector({ companies }: { companies: Company[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedId = searchParams.get("company") ?? "all";

  const options = [
    { id: "all", label: ALL_COMPANIES_OPTION.name, colorVar: ALL_COMPANIES_OPTION.colorVar, short: ALL_COMPANIES_OPTION.short },
    ...companies.map((c) => ({
      id: c.id,
      label: c.name,
      colorVar: COMPANY_STYLE[c.legal_name]?.colorVar ?? "var(--color-company-all)",
      short: COMPANY_STYLE[c.legal_name]?.short ?? c.name.slice(0, 2).toUpperCase(),
    })),
  ];

  const current = options.find((o) => o.id === selectedId) ?? options[0];

  function select(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (id === "all") {
      params.delete("company");
    } else {
      params.set("company", id);
    }
    setOpen(false);
    router.push(params.size > 0 ? `${pathname}?${params.toString()}` : pathname);
  }

  return (
    <div className="border-b border-sidebar-line px-4 py-3.5">
      <div className="mb-2 text-[11px] font-bold tracking-wide text-sidebar-text/60">VIEWING</div>
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2.5 rounded-lg border border-sidebar-line bg-sidebar-field px-2.5 py-2.5 text-sidebar-text"
        >
          <span
            className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white"
            style={{ background: current.colorVar }}
          >
            {current.short}
          </span>
          <span className="flex-1 text-left text-[13px] font-semibold">{current.label}</span>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-60">
            <path d="M5 8l5 5 5-5" />
          </svg>
        </button>

        {open && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-lg border border-border-strong bg-surface shadow-2xl">
            {options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => select(opt.id)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-text hover:bg-surface-alt"
              >
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[9px] font-bold text-white"
                  style={{ background: opt.colorVar }}
                >
                  {opt.short}
                </span>
                <span className="flex-1 text-[13px]">{opt.label}</span>
                {opt.id === selectedId && (
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" className="text-primary" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 10l4 4 8-8" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CompanyQuickLinks({ companies }: { companies: Company[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("company") ?? "all";

  function select(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("company", id);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="px-3 pb-1.5 pt-3 text-[11px] font-bold tracking-wide text-sidebar-text/55">
        COMPANIES
      </div>
      {companies.map((c) => {
        const style = COMPANY_STYLE[c.legal_name];
        return (
          <button
            key={c.id}
            onClick={() => select(c.id)}
            className={`flex items-center gap-3 rounded-lg px-3 py-1.5 pl-6 text-left text-[13px] transition ${
              selectedId === c.id ? "bg-sidebar-active text-sidebar-active-text" : "text-sidebar-text/70 hover:text-sidebar-text"
            }`}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: style?.colorVar ?? "var(--color-company-all)" }}
            />
            <span className="truncate">{c.name}</span>
          </button>
        );
      })}
    </div>
  );
}
