import type { ReactNode } from "react";

/**
 * Pieces of the soft look (blush and rose, a serif title, a gentle greeting). Colours come from the tokens that `.soft-theme`
 * sets, so these only describe the shape.
 */

/** The page wrapper: everything inside takes the soft colours. */
export function SoftPage({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`soft-theme mx-auto flex max-w-[1500px] flex-col gap-5 rounded-[28px] border border-border p-4 sm:p-6 ${className}`}>{children}</div>;
}

/** A small leaf drawn in the title corner. */
function Leaf() {
  return (
    <svg width="46" height="62" viewBox="0 0 46 62" fill="none" stroke="#a87372" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-80">
      <path d="M23 60C23 40 23 24 23 4" />
      <path d="M23 46C14 44 8 38 8 28c9 1 15 7 15 18Z" />
      <path d="M23 34C32 32 38 26 38 16c-9 1-15 7-15 18Z" />
      <path d="M23 20C17 19 13 15 13 9c6 0 10 4 10 11Z" />
    </svg>
  );
}

/** The page banner: serif title, a line under it, and room on the right for buttons or a date. */
export function SoftHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-border px-6 py-5" style={{ background: "linear-gradient(100deg, #f6e4e1 0%, #fbeeea 55%, #eef2ea 100%)" }}>
      <div className="flex items-center gap-4">
        <Leaf />
        <div>
          <h1 className="soft-serif text-[28px] font-bold leading-tight tracking-tight text-text">{title}</h1>
          {subtitle && <p className="mt-1 text-[14px] text-text-secondary">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

/** "Hello there, name": a round initial, a friendly line and today's date. */
export function SoftGreeting({ name, line, dateLabel }: { name: string; line: string; dateLabel: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "•";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-5 py-3.5">
      <div className="flex items-center gap-3.5">
        <span className="flex h-11 w-11 items-center justify-center rounded-full text-[18px] font-extrabold text-white" style={{ background: "linear-gradient(135deg, #c99a99, #a87372)" }} aria-hidden="true">
          {initial}
        </span>
        <div>
          <div className="soft-serif text-[18px] font-bold text-text">{`Hello, ${name}`}</div>
          <div className="text-[13px] text-text-secondary">{line}</div>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-surface-alt px-3.5 py-1.5 text-right">
        <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Today is</div>
        <div className="text-[13.5px] font-bold text-text">{dateLabel}</div>
      </div>
    </div>
  );
}

/** A round gold-edged icon for a figure or a quick link. */
export function GoldBadge({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[17px]" style={{ background: "#fbf3df", border: "1.5px solid #cfae67" }} aria-hidden="true">
      {children}
    </span>
  );
}
