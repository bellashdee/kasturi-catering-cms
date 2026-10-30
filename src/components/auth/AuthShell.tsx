import { GuestLanguageBar } from "@/components/i18n/GuestLanguageBar";

/** Blush pink and matcha green with a little gold on cream: the colours of the sign-in and sign-up pages. */
export const AUTH_THEME = {
  "--color-primary": "#a85d6b",
  "--color-primary-hover": "#924d5b",
  "--color-accent": "#c9a56a",
  "--color-border-strong": "#e3c9c4",
  "--color-text": "#33262b",
  "--color-text-secondary": "#62504f",
} as Record<string, string>;

/** A catering table: a covered dish on its tray with the steam rising, plates, and a few fresh leaves. */
function CateringIllustration() {
  return (
    <svg viewBox="0 0 220 170" className="h-full w-full" fill="none" aria-hidden="true">
      <ellipse cx="110" cy="152" rx="92" ry="10" fill="#33402e" opacity="0.14" />
      {/* the tray */}
      <rect x="22" y="128" width="176" height="14" rx="7" fill="#e9dcc3" />
      <rect x="22" y="128" width="176" height="6" rx="3" fill="#f6ecd8" />
      {/* the covered dish */}
      <path d="M50 128a60 60 0 0 1 120 0z" fill="#f4f1ea" />
      <path d="M50 128a60 60 0 0 1 120 0z" fill="url(#shine)" />
      <path d="M62 120a48 48 0 0 1 20-37" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.75" />
      <rect x="44" y="124" width="132" height="8" rx="4" fill="#d9ccb0" />
      <circle cx="110" cy="62" r="7" fill="#c9a56a" />
      <rect x="106" y="66" width="8" height="6" rx="2" fill="#b58f55" />
      {/* the steam */}
      <path d="M92 44c-6-8 6-12 0-22M110 36c-6-8 6-12 0-22M128 44c-6-8 6-12 0-22" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" opacity="0.8" />
      {/* plates on the left */}
      <ellipse cx="34" cy="122" rx="22" ry="5" fill="#fff" opacity="0.95" />
      <ellipse cx="34" cy="117" rx="20" ry="4.5" fill="#f1c3c8" />
      <ellipse cx="34" cy="112" rx="18" ry="4" fill="#fff" />
      {/* a fork and a spoon on the right */}
      <g stroke="#7a8d6c" strokeWidth="3" strokeLinecap="round">
        <path d="M184 124V92M178 92v12a6 6 0 0 0 12 0V92M184 92v8" />
        <path d="M200 124V98" />
      </g>
      <ellipse cx="200" cy="90" rx="5" ry="8" fill="#7a8d6c" />
      {/* leaves and a cherry tomato */}
      <path d="M176 138c8-14 22-14 28-8-8 10-20 12-28 8z" fill="#8aa37f" />
      <path d="M16 138c6-12 18-14 26-8-8 10-18 12-26 8z" fill="#9db88f" />
      <circle cx="152" cy="140" r="6" fill="#d9777a" />
      <path d="M150 134c2-4 5-4 6-2" stroke="#6f8a5f" strokeWidth="2" strokeLinecap="round" />
      <defs>
        <linearGradient id="shine" x1="50" y1="70" x2="170" y2="128" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#c9d3c1" stopOpacity="0.6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * The sign-in and sign-up pages: a matcha-green top with the name of the system and the catering table, and the form on a white sheet
 * with rounded corners under it. One column of the same width on a phone and on a computer.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fcf6ee] p-0 sm:p-6" style={AUTH_THEME as React.CSSProperties}>
      <GuestLanguageBar />
      <div className="relative flex min-h-screen w-full max-w-[460px] flex-col overflow-hidden bg-white sm:min-h-0 sm:rounded-[2.25rem] sm:border sm:border-[#ecd9d2] sm:shadow-[0_30px_70px_-30px_rgba(90,60,60,0.35)]">
        <div className="relative overflow-hidden rounded-b-[2.25rem] bg-gradient-to-br from-[#7d9d6c] via-[#98b585] to-[#c3d3a6] px-7 pb-6 pt-10 text-white">
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-[#f1c3c8]/35" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 left-24 h-40 w-40 rounded-full bg-white/15" />
          <div className="relative z-10 flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/90 text-[14px] font-extrabold text-[#a85d6b] shadow-sm">CM</div>
            <div className="text-[13px] font-extrabold uppercase leading-tight tracking-wide">Central Management System</div>
          </div>
          <div className="relative z-10 mt-5 flex items-end justify-between gap-2">
            <div className="pb-3">
              <div className="max-w-[190px] text-[26px] font-extrabold leading-tight">Catering, made simple.</div>
              <div className="mt-2 max-w-[170px] text-[13px] leading-snug text-white/90">Every event, every meal, in one place.</div>
            </div>
            <div className="-mb-2 h-[150px] w-[190px] shrink-0">
              <CateringIllustration />
            </div>
          </div>
        </div>
        <div className="flex flex-1 flex-col px-7 pb-8 pt-7">{children}</div>
      </div>
    </div>
  );
}
