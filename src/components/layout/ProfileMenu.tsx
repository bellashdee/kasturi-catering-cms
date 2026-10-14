"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** The signed-in person: name and role in the bar, and a menu with their details, Settings and Sign out. */
export function ProfileMenu({ fullName, email, roleLabel }: { fullName: string; email: string; roleLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label="Profile menu"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-bg"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-white">{initials(fullName) || "?"}</span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-40 truncate text-[14px] font-semibold leading-tight text-text">{fullName}</span>
          <span className="block text-[12.5px] leading-tight text-text-secondary">{roleLabel}</span>
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-64 rounded-xl border border-border-strong bg-surface shadow-lg">
          <div className="border-b border-border px-4 py-3">
            <div className="truncate text-[14px] font-bold text-text">{fullName}</div>
            {email && <div className="truncate text-[12.5px] text-text-secondary">{email}</div>}
            <div className="mt-0.5 text-[12.5px] font-semibold text-primary">{roleLabel}</div>
          </div>
          <Link href="/settings" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-[14px] font-medium text-text hover:bg-bg">
            Settings
          </Link>
          <button type="button" onClick={signOut} className="block w-full border-t border-border px-4 py-2.5 text-left text-[14px] font-semibold text-danger hover:bg-danger-bg">
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
