"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { AuthShell } from "@/components/auth/AuthShell";
import { KEEP_SIGNED_IN_KEY } from "@/components/auth/SessionGuard";

/** The email of the account for what was typed in the first box (an email stays as it is, a username is looked up on the server). */
async function resolveLoginIdentifier(identifier: string): Promise<string> {
  const res = await fetch("/api/resolve-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier }) });
  if (!res.ok) throw new Error("Could not reach the server. Please try again.");
  const data = (await res.json()) as { email?: string };
  return data.email || identifier.trim();
}

/** A round, pale box with its small picture on the left (as in the sign-in of a phone app). */
const PILL =
  "h-14 w-full rounded-full border border-[#e3c9c4] bg-[#fffdfb] pl-12 pr-4 text-[15px] text-text outline-none placeholder:text-text-secondary/60 focus:border-[#8aa37f] focus:ring-4 focus:ring-[#8aa37f]/25 [&:-webkit-autofill]:[-webkit-box-shadow:0_0_0_100px_#fffdfb_inset] [&:-webkit-autofill]:[-webkit-text-fill-color:#33262b]";

const BUTTON = "mt-6 h-14 w-full rounded-full bg-gradient-to-r from-[#a85d6b] to-[#cf8a94] text-[16px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(168,93,107,0.7)] transition hover:opacity-95 disabled:opacity-60";

function LeadIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[#8a7b78]">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </span>
  );
}

const UserIcon = () => (
  <LeadIcon>
    <circle cx="10" cy="7" r="3.2" />
    <path d="M3.5 17c.6-3.2 3.2-5.2 6.5-5.2s5.9 2 6.5 5.2" />
  </LeadIcon>
);

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [stuck, setStuck] = useState(false);

  const [mode, setMode] = useState<"password" | "forgot" | "magic-link">("password");
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [magicLinkSentTo, setMagicLinkSentTo] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null);

  async function handleMagicLinkSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMagicLinkLoading(true);
    setMagicLinkError(null);

    let resolvedEmail: string;
    try {
      resolvedEmail = await resolveLoginIdentifier(magicLinkEmail);
    } catch (err) {
      setMagicLinkLoading(false);
      setMagicLinkError(err instanceof Error ? err.message : "Could not reach the server. Please try again.");
      return;
    }
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

      // "Keep me signed in" off = the person is signed out again when the browser is closed (see SessionGuard)
      try {
        localStorage.setItem(KEEP_SIGNED_IN_KEY, keepSignedIn ? "1" : "0");
        sessionStorage.setItem("kcms-alive", "1");
      } catch {
        /* the browser does not keep it: the person stays signed in */
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
    <AuthShell>
      <h1 className="text-[28px] font-extrabold leading-tight text-text">Welcome back</h1>

      {mode === "password" && (
        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3.5">
          {error && <div className="rounded-2xl border border-danger/30 bg-danger-bg px-4 py-2.5 text-sm text-danger">{error}</div>}

          {stuck && (
            <div className="rounded-2xl border border-warning/30 bg-warning-bg px-4 py-2.5 text-sm text-warning">
              You&apos;re signed in, but this page didn&apos;t move on its own.{" "}
              <button
                type="button"
                onClick={() => {
                  // A hard navigation on purpose — the client-side router
                  // is exactly what got stuck, so this bypasses it entirely.
                  window.location.assign("/");
                }}
                className="font-semibold underline"
              >
                Click here to continue to your dashboard
              </button>
              .
            </div>
          )}

          <div className="relative">
            <UserIcon />
            <input
              type="text"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email or Username"
              aria-label="Email or Username"
              autoComplete="username"
              autoCapitalize="none"
              className={PILL}
              suppressHydrationWarning
            />
          </div>

          <div className="relative">
            <LeadIcon>
              <rect x="4" y="9" width="12" height="8" rx="2" />
              <path d="M7 9V6.5a3 3 0 016 0V9" />
            </LeadIcon>
            <PasswordInput required value={password} onChange={setPassword} placeholder="Password" autoComplete="current-password" className={PILL} />
          </div>

          <div className="flex items-center justify-between gap-3 px-1 text-[13.5px]">
            <label className="flex cursor-pointer items-center gap-2 text-text-secondary">
              <input type="checkbox" checked={keepSignedIn} onChange={(e) => setKeepSignedIn(e.target.checked)} className="h-5 w-5 rounded-md accent-[#7d9d6c]" />
              Keep me signed in
            </label>
            <button type="button" onClick={() => { setMode("forgot"); setError(null); }} className="font-semibold text-[#5f7a55] hover:underline">
              Forgot Password?
            </button>
          </div>

          <button type="submit" disabled={loading} className={BUTTON}>
            {redirecting ? "Loading your dashboard..." : loading ? "Signing in..." : "Log In"}
          </button>
        </form>
      )}

      {mode === "forgot" && (
        <div className="mt-4">
          <p className="text-[15px] font-semibold text-text">Forgot your password?</p>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            Passwords are issued and reset by the Administrator only. Ask Madam Penny or Nabilah to set a new password for you.
          </p>
          <button type="button" onClick={() => setMode("magic-link")} className="mt-5 h-12 w-full rounded-full border border-[#8aa37f] text-[14px] font-semibold text-[#5f7a55] hover:bg-[#eef3ea]">
            Sign in with an email link instead
          </button>
          <button type="button" onClick={() => setMode("password")} className={BUTTON.replace("mt-6", "mt-3")}>
            Back to Log In
          </button>
        </div>
      )}

      {mode === "magic-link" &&
        (magicLinkSent ? (
          <div className="mt-6 rounded-2xl border border-success/30 bg-success-bg px-4 py-3 text-sm text-success">
            Check <b>{magicLinkSentTo}</b> for a sign-in link. Click it on this device to continue to your dashboard.
          </div>
        ) : (
          <form onSubmit={handleMagicLinkSubmit} className="mt-4 flex flex-col gap-3.5">
            <p className="text-sm text-text-secondary">We&apos;ll email you a link — click it and you&apos;re signed in, no password needed.</p>
            {magicLinkError && <div className="rounded-2xl border border-danger/30 bg-danger-bg px-4 py-2.5 text-sm text-danger">{magicLinkError}</div>}
            <div className="relative">
              <UserIcon />
              <input
                type="text"
                required
                value={magicLinkEmail}
                onChange={(e) => setMagicLinkEmail(e.target.value)}
                placeholder="Email or Username"
                aria-label="Email or Username"
                autoCapitalize="none"
                className={PILL}
              />
            </div>
            <button type="submit" disabled={magicLinkLoading} className={BUTTON.replace("mt-6", "mt-2")}>
              {magicLinkLoading ? "Sending link..." : "Send sign-in link"}
            </button>
          </form>
        ))}

      {mode !== "password" && mode !== "forgot" && (
        <button type="button" onClick={() => { setMode("password"); setMagicLinkError(null); }} className="mt-4 text-center text-[13px] font-semibold text-[#5f7a55]">
          Sign in with a password instead
        </button>
      )}

      <p className="mt-auto pt-8 text-center text-[14px] text-text-secondary">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-bold text-[#5f7a55] hover:underline">
          Sign Up
        </Link>
      </p>
    </AuthShell>
  );
}
