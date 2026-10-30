"use client";

import { GuestLanguageBar } from "@/components/i18n/GuestLanguageBar";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { resolveLoginIdentifier } from "@/lib/users/login";
import { PasswordInput } from "@/components/shared/PasswordInput";

/** Blush pink and sage green with a little gold on cream: the colours of the sign-in page (blush rose for the button, sage green for the links and the focus). */
const BLUSH_SAGE = {
  "--color-primary": "#a85d6b",
  "--color-primary-hover": "#924d5b",
  "--color-accent": "#c9a56a",
  "--color-border-strong": "#e3c9c4",
  "--color-text": "#33262b",
  "--color-text-secondary": "#62504f",
} as Record<string, string>;

const FEATURES = [
  "Catering, kitchen and delivery in one place",
  "Finance, petty cash and staff claims",
  "HR, licences and company records",
];

/** The look of the two sign-in boxes (also keeps the browser's autofill from painting them blue). */
const FIELD =
  "mt-1.5 h-11 w-full rounded-lg border border-border-strong bg-[#fffdfb] px-3 text-sm outline-none focus:border-[#8aa37f] focus:ring-4 focus:ring-[#8aa37f]/25 [&:-webkit-autofill]:[-webkit-box-shadow:0_0_0_100px_#fffdfb_inset] [&:-webkit-autofill]:[-webkit-text-fill-color:#33262b]";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [stuck, setStuck] = useState(false);

  const [mode, setMode] = useState<"password" | "magic-link">("password");
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [magicLinkSentTo, setMagicLinkSentTo] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null);

  async function handleMagicLinkSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMagicLinkLoading(true);
    setMagicLinkError(null);

    const resolvedEmail = await resolveLoginIdentifier(magicLinkEmail);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: resolvedEmail,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    setMagicLinkLoading(false);
    if (error) {
      setMagicLinkError(error.message);
      return;
    }
    setMagicLinkSentTo(resolvedEmail);
    setMagicLinkSent(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const resolvedEmail = await resolveLoginIdentifier(email);
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email: resolvedEmail, password });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      // Signed in successfully — navigating to the dashboard can take a
      // moment on a cold Turbopack compile, so say so instead of leaving the
      // button looking frozen on "Signing in...". If router.push() itself
      // never resolves (no exception, just never lands), this timeout gives
      // a manual way out instead of leaving the page stuck forever.
      setRedirecting(true);
      setTimeout(() => setStuck(true), 6000);
      router.push("/");
      router.refresh();
    } catch (err) {
      // Anything unexpected (network failure, a thrown error inside the
      // Supabase client, etc.) now surfaces here instead of leaving the
      // button stuck forever with no explanation.
      setError(err instanceof Error ? `Unexpected error: ${err.message}` : "Unexpected error signing in.");
      setLoading(false);
      setRedirecting(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-[#fcf6ee]" style={BLUSH_SAGE as React.CSSProperties}>
      <GuestLanguageBar />
      <div className="relative hidden w-[480px] shrink-0 flex-col justify-between overflow-hidden bg-gradient-to-b from-[#c3d0b8] via-[#e3dcc8] to-[#f6d6d8] p-14 text-[#33402e] lg:flex">
        {/* soft strawberry and matcha shapes */}
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[#f1c3c8]/60" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 -left-12 h-72 w-72 rounded-full bg-[#a9bd9f]/50" />
        <div aria-hidden="true" className="pointer-events-none absolute bottom-40 right-8 h-24 w-24 rounded-full bg-[#d8bf86]/40" />
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#a85d6b] to-[#c9a56a] text-sm font-extrabold text-white">
            CM
          </div>
          <span className="text-base font-bold">Central Management System</span>
        </div>
        <div className="relative z-10">
          <p className="max-w-[380px] text-3xl font-extrabold leading-snug">
            One system for Signature Solution, Kasturi Indah and O2 Life.
          </p>
          <p className="mt-4 max-w-[360px] text-sm text-[#33402e]/80">
            Dashboards, catering operations, kitchen production, logistics, suppliers
            and finance — all in one place, filtered by company.
          </p>
          <ul className="mt-8 flex max-w-[380px] flex-col gap-3.5 text-[13.5px] font-semibold">
            {FEATURES.map((text) => (
              <li key={text} className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/70 text-[#5f7a55]">
                  <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 10.5l4 4 8-9" />
                  </svg>
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-4 text-xs font-semibold text-[#33402e]/80">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#2f6b45]" />Kasturi Indah</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#8f2a35]" />O2 Life</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#3b6fb6]" />Signature Solution</span>
          </div>
          <p className="mt-3 text-xs text-[#33402e]/60">
            &copy; {new Date().getFullYear()} Central Management System — internal use only
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-[420px] rounded-2xl border border-[#ecd9d2] bg-white p-7 shadow-[0_20px_50px_-20px_rgba(120,70,70,0.25)] sm:p-9">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#a85d6b] to-[#c9a56a] text-sm font-extrabold text-white">
              CM
            </div>
            <span className="text-base font-bold text-text">Central Management System</span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eef3ea] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#5f7a55]">
            <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="4" y="9" width="12" height="8" rx="2" />
              <path d="M7 9V6.5a3 3 0 016 0V9" />
            </svg>
            Secure staff sign-in
          </span>
          <h1 className="mt-3 text-2xl font-extrabold text-text">Welcome back</h1>
          <p className="mt-1.5 text-sm text-text-secondary">
            Sign in to continue to your dashboard.
          </p>

          {mode === "password" ? (
            <form onSubmit={handleSubmit}>
              {error && (
                <div className="mt-5 rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
                  {error}
                </div>
              )}

              {stuck && (
                <div className="mt-5 rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-sm text-warning">
                  You&apos;re signed in, but this page didn&apos;t move on its own.{" "}
                  <button
                    type="button"
                    onClick={() => {
                      // A hard navigation on purpose — the client-side router
                      // is exactly what got stuck, so this bypasses it entirely.
                      window.location.href = "/";
                    }}
                    className="font-semibold underline"
                  >
                    Click here to continue to your dashboard
                  </button>
                  .
                </div>
              )}

              <label className="mt-8 block text-[12.5px] font-semibold text-text-secondary">
                Email or Username
              </label>
              <input
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com.my or username"
                className={FIELD}
                suppressHydrationWarning
              />

              <label className="mt-4 block text-[12.5px] font-semibold text-text-secondary">
                Password
              </label>
              <PasswordInput
                required
                value={password}
                onChange={setPassword}
                placeholder="••••••••••"
                autoComplete="current-password"
                className={FIELD}
              />

              <button
                type="submit"
                disabled={loading}
                className="mt-6 h-[46px] w-full rounded-lg bg-primary text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-60"
              >
                {redirecting ? "Loading your dashboard..." : loading ? "Signing in..." : "Sign in"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode("magic-link");
                  setError(null);
                }}
                className="mt-4 w-full text-center text-[12.5px] font-semibold text-[#5f7a55]"
              >
                Sign in without a password
              </button>
            </form>
          ) : magicLinkSent ? (
            <div className="mt-8 rounded-lg border border-success/30 bg-success-bg px-4 py-3 text-sm text-success">
              Check <b>{magicLinkSentTo}</b> for a sign-in link. Click it on this
              device to continue to your dashboard.
            </div>
          ) : (
            <form onSubmit={handleMagicLinkSubmit}>
              <p className="mt-5 text-sm text-text-secondary">
                We&apos;ll email you a link — click it and you&apos;re signed in, no
                password needed.
              </p>

              {magicLinkError && (
                <div className="mt-4 rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
                  {magicLinkError}
                </div>
              )}

              <label className="mt-5 block text-[12.5px] font-semibold text-text-secondary">
                Email or Username
              </label>
              <input
                type="text"
                required
                value={magicLinkEmail}
                onChange={(e) => setMagicLinkEmail(e.target.value)}
                placeholder="you@company.com.my or username"
                className={FIELD}
              />

              <button
                type="submit"
                disabled={magicLinkLoading}
                className="mt-6 h-[46px] w-full rounded-lg bg-primary text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-60"
              >
                {magicLinkLoading ? "Sending link..." : "Send sign-in link"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode("password");
                  setMagicLinkError(null);
                }}
                className="mt-4 w-full text-center text-[12.5px] font-semibold text-[#5f7a55]"
              >
                Sign in with a password instead
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
