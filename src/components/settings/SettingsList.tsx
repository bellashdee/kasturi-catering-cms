import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The grouped-list look of Settings (as on a phone's settings screen): a small grey group title, then a white rounded card of rows,
 * each row a thin line icon, its name, an optional value on the right and an arrow.
 */

/** Thin line icons (18px, 1.6 stroke) used by the rows. */
const ICONS = {
  user: <><circle cx="10" cy="6.5" r="3.2" /><path d="M3.5 17c.9-3.2 3.4-5 6.5-5s5.6 1.8 6.5 5" /></>,
  globe: <><circle cx="10" cy="10" r="7.2" /><path d="M2.8 10h14.4M10 2.8c2 2.1 3 4.5 3 7.2s-1 5.1-3 7.2c-2-2.1-3-4.5-3-7.2s1-5.1 3-7.2Z" /></>,
  text: <><path d="M3.5 5V3.8h9V5M8 3.8V16M6 16h4" /><path d="M12.5 10.2V9.5h4.5v.7M14.75 9.5V16M13.6 16h2.3" /></>,
  bell: <><path d="M5.2 8.2a4.8 4.8 0 0 1 9.6 0c0 4.3 1.7 5.8 1.7 5.8H3.5s1.7-1.5 1.7-5.8Z" /><path d="M8.3 16.6a1.9 1.9 0 0 0 3.4 0" /></>,
  theme: <><circle cx="10" cy="10" r="7.2" /><path d="M10 2.8v14.4" /><path d="M10 2.8a7.2 7.2 0 0 1 0 14.4Z" fill="currentColor" stroke="none" /></>,
  database: <><ellipse cx="10" cy="4.8" rx="6" ry="2.3" /><path d="M4 4.8v10.4c0 1.3 2.7 2.3 6 2.3s6-1 6-2.3V4.8" /><path d="M4 10c0 1.3 2.7 2.3 6 2.3s6-1 6-2.3" /></>,
  team: <><circle cx="7.3" cy="7" r="2.7" /><path d="M2.5 16.2c.7-2.7 2.5-4.2 4.8-4.2s4.1 1.5 4.8 4.2" /><path d="M12.6 4.6a2.6 2.6 0 0 1 0 4.9M14.2 12.2c1.6.5 2.7 1.8 3.3 4" /></>,
} as const;
export type SettingsIcon = keyof typeof ICONS;

function Icon({ name }: { name: SettingsIcon }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-text-secondary" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

function Chevron({ turn = false }: { turn?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-text-muted transition-transform ${turn ? "group-open:rotate-90" : ""}`} aria-hidden="true">
      <path d="m8 5 5 5-5 5" />
    </svg>
  );
}

const ROW = "flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left";

/** A group: its small grey title and the white card holding its rows (rows are separated by a hairline). */
export function SettingsGroup({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-3 px-1">
        <h2 className="text-[13px] font-semibold text-text-muted">{title}</h2>
        {action}
      </div>
      {/* no overflow-hidden: drop-downs opened inside a row (team filters, member menu) must not be cut off; the first and last rows are rounded instead */}
      <div className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm [&>*:first-child]:rounded-t-2xl [&>*:last-child]:rounded-b-2xl [&>details:last-child>summary]:rounded-b-2xl [&>details[open]:last-child>summary]:rounded-b-none">{children}</div>
    </section>
  );
}

/** A row that opens another page. */
export function SettingsLink({ href, icon, label, hint, value }: { href: string; icon: SettingsIcon; label: string; hint?: string; value?: string }) {
  return (
    <Link href={href} className={`${ROW} hover:bg-surface-alt`}>
      <Icon name={icon} />
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-medium text-text">{label}</span>
        {hint && <span className="block text-[12.5px] text-text-muted">{hint}</span>}
      </span>
      {value && <span className="text-[13px] text-text-muted">{value}</span>}
      <Chevron />
    </Link>
  );
}

/** A row with its own control on the right (a drop-down, a switch). */
export function SettingsRow({ icon, label, hint, children }: { icon: SettingsIcon; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className={ROW}>
      <Icon name={icon} />
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-medium text-text">{label}</span>
        {hint && <span className="block text-[12.5px] text-text-muted">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

/** A row that opens in place: tapping it shows its settings under it (the arrow turns down). */
export function SettingsDisclosure({ icon, label, hint, open = false, children }: { icon: SettingsIcon; label: string; hint?: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="group" open={open}>
      <summary className={`${ROW} list-none hover:bg-surface-alt [&::-webkit-details-marker]:hidden`}>
        <Icon name={icon} />
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-medium text-text">{label}</span>
          {hint && <span className="block text-[12.5px] text-text-muted">{hint}</span>}
        </span>
        <Chevron turn />
      </summary>
      <div className="border-t border-border bg-surface-alt/40 px-4 py-4">{children}</div>
    </details>
  );
}

/** The person's card on top of Settings: a round initial, the name, the email and the role. */
export function SettingsProfileCard({ fullName, email, role }: { fullName: string; email: string; role: string }) {
  const initials = fullName.replace(/^(MS|MR|MRS|MDM|DR|EN|PN|CIK)\.?\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const showEmail = !!email && !email.endsWith("@no-email.invalid");
  return (
    <Link href="/profile" className="flex items-center gap-4 rounded-2xl border border-border bg-surface px-4 py-4 shadow-sm hover:bg-surface-alt">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-[18px] font-bold text-white" aria-hidden="true">
        {initials || "•"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] font-bold text-text">{fullName}</span>
        {showEmail && <span className="block truncate text-[13px] text-text-muted">{email}</span>}
        <span className="block text-[12.5px] font-semibold text-text-secondary">{role}</span>
      </span>
      <Chevron />
    </Link>
  );
}
