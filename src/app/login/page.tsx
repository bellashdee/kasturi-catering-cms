"use client";

import { GuestLanguageBar } from "@/components/i18n/GuestLanguageBar";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { resolveLoginIdentifier } from "@/lib/users/actions";
import { PasswordInput } from "@/components/shared/PasswordInput";

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
    <div className="flex min-h-screen bg-surface">
      <GuestLanguageBar />
      <div className="hidden w-[480px] shrink-0 flex-col justify-between bg-gradient-to-br from-[#fbdcc3] to-[#f6c8a6] p-14 text-[#4a2c18] lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent text-sm font-extrabold text-white">
            CM
          </div>
          <span className="text-base font-bold">Central Management System</span>
        </div>
        <div>
          <p className="max-w-[380px] text-3xl font-extrabold leading-snug">
            One system for Signature Solution, Kasturi Indah and O2 Life.
          </p>
          <p className="mt-4 max-w-[360px] text-sm text-[#4a2c18]/75">
            Dashboards, catering operations, kitchen production, logistics, suppliers
            and finance — all in one place, filtered by company.
          </p>
        </div>
        <p className="text-xs text-[#4a2c18]/55">
          &copy; {new Date().getFullYear()} Central Management System — internal use only
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center p-10">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-extrabold text-text">Welcome back</h1>
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
                className="mt-1.5 h-11 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
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
                className="mt-1.5 h-11 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
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
                className="mt-4 w-full text-center text-[12.5px] font-semibold text-primary"
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
                className="mt-1.5 h-11 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
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
                className="mt-4 w-full text-center text-[12.5px] font-semibold text-primary"
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
