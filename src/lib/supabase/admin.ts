import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Service-role client for user-management actions that Supabase's normal
 * (RLS-governed) client can't do on behalf of another person — creating,
 * updating, or deleting someone else's auth account. Only ever call this
 * from "use server" action files — never from a Client Component, since the
 * service role key must never reach the browser.
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (not the publishable key).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local from your Supabase project's Settings → API → service_role key, then restart the dev server.",
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
