"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PushToggle } from "@/components/settings/PushToggle";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getReminders } from "@/lib/notifications/actions";
import type { Reminder } from "@/lib/notifications/reminders";

const DOT: Record<Reminder["severity"], string> = { danger: "bg-danger", warning: "bg-warning", info: "bg-primary" };
const REFRESH_MS = 5 * 60 * 1000;

/** Adds ?company=... to a link before any #section, and only when the link has no query of its own. */
function withCompany(href: string, query: string): string {
  if (!query || href.includes("?")) return href;
  const [path, hash] = href.split("#");
  return `${path}${query}${hash ? `#${hash}` : ""}`;
}

/** The bell: a count of reminders that need attention and a list of them, built from the real records (see lib/notifications). */
export function NotificationBell({ userId }: { userId: string }) {
  const company = useSearchParams().get("company");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Reminder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const openRef = useRef(false);
  const seenKey = `reminders-seen:${userId}`;

  // the reminders this person has already looked at on this device (kept so the red number stays away after a reload)
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const raw = JSON.parse(localStorage.getItem(seenKey) ?? "[]");
        if (Array.isArray(raw)) setSeen(raw.filter((s): s is string => typeof s === "string"));
      } catch {
        /* no storage: the number simply comes back after a reload */
      }
    }, 0);
    return () => clearTimeout(t);
  }, [seenKey]);

  const markSeen = useCallback(
    (list: Reminder[]) => {
      const keys = list.map((r) => r.title);
      setSeen(keys);
      try {
        localStorage.setItem(seenKey, JSON.stringify(keys));
      } catch {
        /* ignore */
      }
    },
    [seenKey],
  );

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getReminders(company);
    if (result.ok) {
      setItems(result.items);
      setError(null);
      // while the list is open, what it shows has been seen
      if (openRef.current) markSeen(result.items);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [company, markSeen]);

  // load when the page opens or the company changes, then every few minutes
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const every = setInterval(() => void load(), REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, [load]);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

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

  // the red number counts only the reminders not yet looked at (a reminder whose wording changes, e.g. 38 becomes 39, counts again)
  const attention = (items ?? []).filter((i) => i.severity !== "info" && !seen.includes(i.title)).length;
  const query = company ? `?company=${company}` : "";

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label={attention > 0 ? `Notifications: ${attention} need attention` : "Notifications"}
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          openRef.current = next;
          setOpen(next);
          if (next) {
            // opening the bell is looking at the list: the red number goes away at once
            if (items) markSeen(items);
            void load();
          }
        }}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-border-strong text-text hover:bg-bg"
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        {attention > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold leading-none text-white">
            {attention > 99 ? "99+" : attention}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-border-strong bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-[15px] font-bold text-text">Reminders</div>
            <button type="button" onClick={() => void load()} disabled={loading} className="text-[13px] font-semibold text-primary disabled:opacity-60">
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          <div className="max-h-[26rem] overflow-y-auto">
            {error && <div className="px-4 py-4 text-[14px] text-danger">{error}</div>}
            {!error && items === null && <div className="px-4 py-6 text-center text-[14px] text-text-secondary">Loading...</div>}
            {!error && items?.length === 0 && <div className="px-4 py-6 text-center text-[14px] text-text-secondary">Nothing needs your attention right now.</div>}
            {!error &&
              items?.map((r) => {
                const body = (
                  <>
                    <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[r.severity]}`} />
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold leading-snug text-text">{r.title}</span>
                      {r.more ? <span className="block text-[12.5px] font-semibold text-primary">{`+${r.more} more`}</span> : null}
                      <span className="block text-[12.5px] text-text-secondary">{r.meta}</span>
                    </span>
                  </>
                );
                const cls = "flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0";
                return r.href ? (
                  <Link key={r.title} href={withCompany(r.href, query)} onClick={() => setOpen(false)} className={`${cls} hover:bg-bg`}>
                    {body}
                  </Link>
                ) : (
                  <div key={r.title} className={cls}>
                    {body}
                  </div>
                );
              })}
          </div>
          <PushToggle compact />
          <div className="border-t border-border px-4 py-2.5 text-right">
            <Link href={`/${query}`} onClick={() => setOpen(false)} className="text-[13px] font-semibold text-primary">
              Open dashboard
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
