"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-surface">
      <div className="hidden w-[480px] shrink-0 flex-col justify-between bg-gradient-to-br from-navy-900 via-[#12314A] to-navy-700 p-14 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent text-sm font-extrabold">
            CM
          </div>
          <span className="text-base font-bold">Central Management System</span>
        </div>
        <div>
          <p className="max-w-[380px] text-3xl font-extrabold leading-snug">
            One system for Signature Solution, Kasturi Indah and O2 Life.
          </p>
          <p className="mt-4 max-w-[360px] text-sm text-white/65">
            Dashboards, catering operations, kitchen production, logistics, suppliers
            and finance — all in one place, filtered by company.
          </p>
        </div>
        <p className="text-xs text-white/40">
          &copy; {new Date().getFullYear()} Central Management System — internal use only
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center p-10">
        <form onSubmit={handleSubmit} className="w-full max-w-sm">
          <h1 className="text-2xl font-extrabold text-text">Welcome back</h1>
          <p className="mt-1.5 text-sm text-text-secondary">
            Sign in to continue to your dashboard.
          </p>

          {error && (
            <div className="mt-5 rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          <label className="mt-8 block text-[12.5px] font-semibold text-text-secondary">
            Email address
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com.my"
            className="mt-1.5 h-11 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
          />

          <label className="mt-4 block text-[12.5px] font-semibold text-text-secondary">
            Password
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••"
            className="mt-1.5 h-11 w-full rounded-lg border border-border-strong px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
          />

          <button
            type="submit"
            disabled={loading}
            className="mt-6 h-[46px] w-full rounded-lg bg-primary text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <p className="mt-5 text-center text-[12.5px] text-text-muted">
            No account yet?{" "}
            <Link href="/signup" className="font-semibold text-primary">
              Create one
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
