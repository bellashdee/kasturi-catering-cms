"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function SearchBox({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("q", value);
    else params.delete("q");
    router.push(params.size > 0 ? `${pathname}?${params.toString()}` : pathname);
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2.5">
      <div className="flex h-10 w-80 items-center gap-2 rounded-lg border border-border bg-surface px-3">
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="#98A2B3" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="9" cy="9" r="6" />
          <line x1="14" y1="14" x2="18" y2="18" />
        </svg>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full text-[13px] outline-none"
        />
      </div>
      <button type="submit" className="rounded-lg border border-border-strong bg-surface px-3.5 py-2.5 text-[13px] font-semibold text-text">
        Search
      </button>
    </form>
  );
}
