import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

/**
 * The browser talks to Supabase through this site's own address (/supabase, forwarded by next.config.ts), not straight to
 * supabase.co. On some networks supabase.co cannot be resolved or reached ("Failed to fetch" on every upload or sign-in),
 * while this site's own address always works. The session cookie keeps the same name the server uses.
 */
export function createClient() {
  const direct = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const projectRef = new URL(direct).hostname.split(".")[0];
  const url = typeof window !== "undefined" ? `${window.location.origin}/supabase` : direct;
  return createBrowserClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: { name: `sb-${projectRef}-auth-token` },
  });
}
