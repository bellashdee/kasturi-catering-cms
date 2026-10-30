import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Login accepts either an email or a username. RLS blocks anonymous reads of `profiles`, so this runs on the server with the admin
 * client: it only ever returns an email string, never anything else about the account. A username is matched without regard to capital
 * letters or spaces around it (a phone keyboard writes "Zarif" where the username is ZARIF).
 * This is a plain address (not a server action) so that a sign-in page opened just before a new version of the system went live
 * still finds it.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { identifier?: unknown } | null;
  const trimmed = typeof body?.identifier === "string" ? body.identifier.trim() : "";
  if (!trimmed) return NextResponse.json({ email: "" });
  if (trimmed.includes("@")) return NextResponse.json({ email: trimmed });

  const admin = createAdminClient();
  const like = trimmed.replace(/[\%_]/g, (c) => `\${c}`);
  const { data } = await admin.from("profiles").select("username, email").ilike("username", `${like}%`).limit(20);
  const wanted = trimmed.toLowerCase();
  const matches = (data ?? []).filter((p) => (p.username ?? "").trim().toLowerCase() === wanted);
  const best = matches.find((p) => p.username?.trim() === trimmed) ?? matches[0];
  return NextResponse.json({ email: best?.email ?? trimmed });
}
