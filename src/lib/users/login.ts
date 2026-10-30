"use server";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Login accepts either an email or a username. RLS blocks anonymous reads of `profiles`, so this runs server-side with the
 * admin client: it only ever returns an email string, never anything else about the account. A username is matched without
 * regard to capital letters or spaces around it (a phone keyboard writes "Zarif" where the username is ZARIF).
 */
export async function resolveLoginIdentifier(identifier: string): Promise<string> {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) return trimmed;

  const admin = createAdminClient();
  const like = trimmed.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data } = await admin.from("profiles").select("username, email").ilike("username", `${like}%`).limit(20);
  const wanted = trimmed.toLowerCase();
  const matches = (data ?? []).filter((p) => (p.username ?? "").trim().toLowerCase() === wanted);
  const best = matches.find((p) => p.username?.trim() === trimmed) ?? matches[0];
  return best?.email ?? trimmed;
}
